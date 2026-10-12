import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import { getAvailableSlots, createAppointment } from '../../services/schedule/scheduleService.js';
import { sendDocumentCategoryList, handleDocumentCategorySelection } from '../../services/documents/documentService.js';
import { cleanAndValidateCpf, getNextBusinessDays } from '../../utils/validators/index.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Validação do Webhook Meta API.
 */
export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

/**
 * Encerra a sessão atual marcando como RESOLVED para que a próxima interação inicie zerada.
 */
const closeCurrentSession = async (sessionId: string) => {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { status: 'RESOLVED', isChat: false, currentStepId: null, stepState: null },
  });
};  

/**
 * Dispara a triagem de categoria para o agendamento presencial.
 */
const triggerCategorySelection = async (phoneNumber: string, sessionId: string) => {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { stepState: 'SCH_STEP_CAT_SELECT', currentStepId: null, isChat: false },
  });

  await sendTextMessage(
    phoneNumber,
    "📋 *Triagem para Agendamento Presencial*\n\nSelecione o assunto da sua reclamação:"
  );

  const group1 = [
    { id: 'btn_sch_cat_CARTAO_SEGURO', text: 'Seguro em Cartão' },
    { id: 'btn_sch_cat_EMPRESTIMO_FOLHA', text: 'Empréstimo em Folha' },
    { id: 'btn_sch_cat_INSS_RMC_RCC', text: 'Desconto INSS/RMC/RCC' },
  ];
  await sendInteractiveMessage(phoneNumber, "Opções de Cobrança e Benefício:", group1);

  const group2 = [
    { id: 'btn_sch_cat_CONTRATO_CANCELAMENTO', text: 'Contratos/Cancelamento' },
    { id: 'btn_sch_cat_GARANTIA_VICIO', text: 'Garantia e Defeito' },
    { id: 'btn_sch_cat_GERAL', text: 'Outros Assuntos' },
  ];
  await sendInteractiveMessage(phoneNumber, "Outros temas de consumo:", group2);
};

/**
 * Processamento principal das mensagens do Webhook.
 */
export const handleWebhookEvent = async (req: Request, res: Response): Promise<any> => {
  const { body } = req;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  res.status(200).send('EVENT_RECEIVED');

  try {
    for (const entry of body.entry) {
      const changes = entry.changes[0]?.value;
      if (!changes?.messages || changes.messages.length === 0) continue;

      const message = changes.messages[0];
      const phoneNumber = message.from;
      let responseStep = null;

      // 1. GERENCIAMENTO DE SESSÃO ISOLADA
      let session = await prisma.userSession.findFirst({
        where: { phoneNumber, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });

      // Se não houver sessão aberta, cria uma nova linha com ID novo (contexto limpo)
      if (!session) {
        session = await prisma.userSession.create({
          data: { phoneNumber, isChat: false, status: 'OPEN' },
        });
      }

      // 2. PROCESSAMENTO DE TEXTO LIVRE
      if (message.type === 'text') {
        const originalText = message.text.body;
        const userText = originalText.toLowerCase().trim();

        await prisma.chatLog.create({
          data: { sessionId: session.id, phoneNumber, direction: 'INBOUND', messageText: originalText },
        });

        // COMANDOS DE FUGA: Encerra sessão antiga e cria uma nova limpa
        const escapeCommands = ['menu', 'sair', 'voltar', 'cancelar', 'iniciar'];
        if (escapeCommands.includes(userText)) {
          await closeCurrentSession(session.id);
          session = await prisma.userSession.create({
            data: { phoneNumber, isChat: false, status: 'OPEN' },
          });
        }

        // Estado: Coleta de Nome
        if (session.stepState?.startsWith('SCH_STEP_NAME:')) {
          const categoryKey = session.stepState.replace('SCH_STEP_NAME:', '');
          const userName = originalText.trim();

          await prisma.userSession.update({
            where: { id: session.id },
            data: { userName, stepState: `SCH_STEP_CPF:${categoryKey}:${userName}`, currentStepId: null },
          });

          await sendTextMessage(phoneNumber, `Obrigado, *${userName}*!\n\nAgora, por favor, digite o seu **CPF** (apenas números ou formatado):`);
          continue;
        }

        // Estado: Coleta de CPF
        if (session.stepState?.startsWith('SCH_STEP_CPF:')) {
          const parts = session.stepState.split(':');
          const categoryKey = parts[1] ?? 'GERAL';
          const userName = parts[2] ?? 'Cidadão';

          const validCpf = cleanAndValidateCpf(originalText);
          if (!validCpf) {
            await sendTextMessage(phoneNumber, "⚠️ *CPF Inválido!* Por favor, digite um CPF válido contendo 11 dígitos:");
            continue;
          }

          await prisma.userSession.update({
            where: { id: session.id },
            data: { userCpf: validCpf, stepState: `SCH_STEP_DATE:${categoryKey}:${userName}:${validCpf}`, currentStepId: null },
          });

          const nextDays = getNextBusinessDays(3);
          const dateOptions = nextDays.map((d) => ({ id: `btn_sch_date_${d.dateStr}`, text: d.label }));

          await sendInteractiveMessage(
            phoneNumber,
            `CPF *${validCpf}* registrado!\n\nEscolha o dia de sua preferência para o atendimento presencial no PROCON:`,
            dateOptions
          );
          continue;
        }

        // Estado: Comentário de Feedback
        if (session.stepState === 'FEEDBACK_COMMENT') {
          const lastFeedback = await prisma.sessionFeedback.findFirst({
            where: { sessionId: session.id },
            orderBy: { createdAt: 'desc' },
          });

          if (lastFeedback) {
            await prisma.sessionFeedback.update({
              where: { id: lastFeedback.id },
              data: { comment: originalText },
            });
          }

          await closeCurrentSession(session.id);
          await sendTextMessage(phoneNumber, "Agradecemos pelo seu comentário! Seu feedback foi registrado e será analisado pela nossa equipe. Tenha um excelente dia! ⚖️");
          continue;
        }

        // Modo Chat Livre (IA + RAG)
        if (session.isChat) {
          await sendTextMessage(phoneNumber, "⏳ *Pesquisando no Código de Defesa do Consumidor...*");
          const ragResult = await answerWithRAG(originalText, session.id);

          await prisma.chatLog.create({
            data: { sessionId: session.id, phoneNumber, direction: 'OUTBOUND', messageText: ragResult.texto },
          });

          if (ragResult.tipoResposta === 'redirecionamento') {
            const options = [
              { id: 'btn_agendar_sim', text: '📅 Agendar Consulta' },
              { id: 'btn_agendar_nao', text: 'Não, obrigado' },
            ];
            await sendInteractiveMessage(phoneNumber, ragResult.texto, options);
          } else if (ragResult.tipoResposta === 'clarificacao') {
            await sendTextMessage(phoneNumber, ragResult.texto);
          } else {
            const finalMessage = `${ragResult.texto}\n\nEssa orientação solucionou sua dúvida?`;
            const options = [
              { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
              { id: 'btn_feedback_nao', text: '👎 Não resolveu' },
            ];
            await sendInteractiveMessage(phoneNumber, finalMessage, options);
          }
        } else {
          // Navegação do Menu Inicial
          const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'];

          if (greetings.includes(userText) || escapeCommands.includes(userText)) {
            responseStep = await prisma.step.findFirst({
              where: { isStart: true },
              include: { options: true },
            });
          } else {
            // Relato direto sem passar pelo menu -> Ativa RAG
            session = await prisma.userSession.update({
              where: { id: session.id },
              data: { isChat: true },
            });

            await sendTextMessage(phoneNumber, "⏳ *Analisando seu relato...*");
            const ragResult = await answerWithRAG(originalText, session.id);

            await prisma.chatLog.create({
              data: { sessionId: session.id, phoneNumber, direction: 'OUTBOUND', messageText: ragResult.texto },
            });

            if (ragResult.tipoResposta === 'redirecionamento') {
              const options = [
                { id: 'btn_agendar_sim', text: '📅 Agendar Consulta' },
                { id: 'btn_agendar_nao', text: 'Não, obrigado' },
              ];
              await sendInteractiveMessage(phoneNumber, ragResult.texto, options);
            } else if (ragResult.tipoResposta === 'clarificacao') {
              await sendTextMessage(phoneNumber, ragResult.texto);
            } else {
              const finalMessage = `${ragResult.texto}\n\nEssa orientação solucionou sua dúvida?`;
              const options = [
                { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                { id: 'btn_feedback_nao', text: '👎 Não resolveu' },
              ];
              await sendInteractiveMessage(phoneNumber, finalMessage, options);
            }
            continue;
          }
        }
      }

      // 3. PROCESSAMENTO DE BOTÕES E OPÇÕES INTERATIVAS
      else if (message.type === 'interactive') {
        let selectedOptionId: string | null = null;

        if (message.interactive.type === 'button_reply') {
          selectedOptionId = message.interactive.button_reply.id;
        } else if (message.interactive.type === 'list_reply') {
          selectedOptionId = message.interactive.list_reply.id;
        }

        if (!selectedOptionId) continue;

        // Disparador de Agendamento
        if (selectedOptionId === 'btn_agendar_sim') {
          await triggerCategorySelection(phoneNumber, session.id);
          continue;
        }

        if (selectedOptionId === 'btn_agendar_nao') {
          const ratingOptions = [
            { id: 'btn_rate_5', text: '⭐ 5 - Excelente' },
            { id: 'btn_rate_3', text: '⭐ 3 - Regular' },
            { id: 'btn_rate_1', text: '⭐ 1 - Péssimo' },
          ];
          await sendInteractiveMessage(
            phoneNumber,
            "Compreendido! Antes de encerrar, como você avalia o atendimento do nosso assistente virtual hoje?",
            ratingOptions
          );
          continue;
        }

        // Resposta de Orientação
        if (selectedOptionId === 'btn_feedback_sim') {
          const ratingOptions = [
            { id: 'btn_rate_5', text: '⭐ 5 - Excelente' },
            { id: 'btn_rate_3', text: '⭐ 3 - Regular' },
            { id: 'btn_rate_1', text: '⭐ 1 - Péssimo' },
          ];
          await sendInteractiveMessage(
            phoneNumber,
            "Ficamos felizes em ajudar! Como você avalia a precisão das orientações do nosso assistente virtual?",
            ratingOptions
          );
          continue;
        }

        if (selectedOptionId === 'btn_feedback_nao') {
          const scheduleOptions = [
            { id: 'btn_agendar_sim', text: '📅 Agendar Consulta' },
            { id: 'btn_agendar_nao', text: 'Não, obrigado' },
          ];

          await sendInteractiveMessage(
            phoneNumber,
            "Entendemos. Como a orientação não resolveu seu caso, você prefere agendar um atendimento presencial no PROCON para análise da nossa equipe?",
            scheduleOptions
          );
          continue;
        }

        // Lista de Documentos Necessários
        if (selectedOptionId.startsWith('doc_req_')) {
          await handleDocumentCategorySelection(phoneNumber, selectedOptionId);
          continue;
        }

        // Agendamento: Categoria
        if (selectedOptionId.startsWith('btn_sch_cat_')) {
          const categoryKey = selectedOptionId.replace('btn_sch_cat_', '');
          await prisma.userSession.update({
            where: { id: session.id },
            data: { stepState: `SCH_STEP_NAME:${categoryKey}`, currentStepId: null },
          });

          await sendTextMessage(phoneNumber, "Para iniciarmos seu agendamento, por favor, digite o seu **Nome Completo**:");
          continue;
        }

        // Agendamento: Seleção de Data
        if (selectedOptionId.startsWith('btn_sch_date_')) {
          const selectedDate = selectedOptionId.replace('btn_sch_date_', '');
          if (!session.stepState?.startsWith('SCH_STEP_DATE:')) {
            await sendTextMessage(phoneNumber, "Sessão de agendamento expirada. Digite *menu* para recomeçar.");
            continue;
          }

          const parts = session.stepState.split(':');
          const categoryKey = parts[1] ?? 'GERAL';
          const userName = parts[2] ?? 'Cidadão';
          const userCpf = parts[3] ?? '000.000.000-00';

          const availableSlots = await getAvailableSlots(selectedDate);
          if (availableSlots.length === 0) {
            await sendTextMessage(phoneNumber, "⚠️ Não há horários vagos para esta data. Por favor, escolha outro dia:");
            const nextDays = getNextBusinessDays(3);
            const dateOptions = nextDays.map((d) => ({ id: `btn_sch_date_${d.dateStr}`, text: d.label }));
            await sendInteractiveMessage(phoneNumber, "Datas disponíveis:", dateOptions);
            continue;
          }

          await prisma.userSession.update({
            where: { id: session.id },
            data: { stepState: `SCH_STEP_SLOT:${categoryKey}:${userName}:${userCpf}:${selectedDate}`, currentStepId: null },
          });

          const slotOptions = availableSlots.slice(0, 3).map((slot) => ({
            id: `btn_sch_slot_${slot.dateTimeIso}`,
            text: `Horário: ${slot.time}`,
          }));

          const [yyyy, mm, dd] = selectedDate.split('-');
          await sendInteractiveMessage(
            phoneNumber,
            `Horários livres para o dia **${dd}/${mm}/${yyyy}**:\n\nSelecione o melhor horário para você:`,
            slotOptions
          );
          continue;
        }

        // Agendamento: Confirmação de Horário
        if (selectedOptionId.startsWith('btn_sch_slot_')) {
          const dateTimeIso = selectedOptionId.replace('btn_sch_slot_', '');
          if (!session.stepState?.startsWith('SCH_STEP_SLOT:')) {
            await sendTextMessage(phoneNumber, "Sessão expirada. Digite *menu* para recomeçar.");
            continue;
          }

          const parts = session.stepState.split(':');
          const categoryKey = parts[1] ?? 'GERAL';
          const userName = parts[2] ?? 'Cidadão';
          const userCpf = parts[3] ?? '000.000.000-00';

          const appointment = await createAppointment({
            sessionId: session.id,
            categoryKey,
            userName,
            userCpf,
            phoneNumber,
            scheduledAtIso: dateTimeIso,
            issueSummary: 'Solicitado via Atendente Virtual WhatsApp',
          });

          const dateFormatted = appointment.scheduledAt.toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });

          const timeFormatted = appointment.scheduledAt.toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
          });

          const docListText = appointment.documentGuide?.requiredDocs?.length
            ? appointment.documentGuide.requiredDocs.map((doc, idx) => `  ${idx + 1}. ${doc}`).join('\n')
            : '  1. RG e CPF\n  2. Comprovantes do problema\n  3. CNPJ da empresa';

          const confirmationMessage = `✅ *Agendamento confirmado!*

📅 *Data:* ${dateFormatted}
⏰ *Horário:* ${timeFormatted}
👤 *Nome:* ${appointment.userName}
🪪 *CPF:* ${appointment.userCpf}
📋 *Assunto:* ${appointment.categoryName}

📍 *Local:* Procon Municipal de Jacareí - Av. Cap. Joaquim Pinheiro do Prado, nº 222 - Centro, Jacareí - SP

⚠️ *DOCUMENTOS OBRIGATÓRIOS PARA A CONSULTA:*
${docListText}

${appointment.documentGuide?.observations ? `💡 *Aviso Importante:* ${appointment.documentGuide.observations}\n` : ''}
Digite *menu* a qualquer momento para voltar ao início.`;

          await sendTextMessage(phoneNumber, confirmationMessage);

          const ratingOptions = [
            { id: 'btn_rate_5', text: '⭐ 5 - Excelente' },
            { id: 'btn_rate_3', text: '⭐ 3 - Regular' },
            { id: 'btn_rate_1', text: '⭐ 1 - Péssimo' },
          ];
          await sendInteractiveMessage(phoneNumber, "Como você avalia a facilidade de agendamento pelo WhatsApp?", ratingOptions);
          continue;
        }

        // Processamento da Avaliação (1 a 5 Estrelas)
        if (selectedOptionId.startsWith('btn_rate_')) {
          const rating = parseInt(selectedOptionId.replace('btn_rate_', ''), 10);

          await prisma.sessionFeedback.create({
            data: { sessionId: session.id, phoneNumber, rating },
          });

          if (rating <= 3) {
            await prisma.userSession.update({
              where: { id: session.id },
              data: { stepState: 'FEEDBACK_COMMENT', currentStepId: null },
            });
            await sendTextMessage(phoneNumber, "Agradecemos por avaliar. Poderia nos enviar um breve comentário sobre o que podemos melhorar?");
          } else {
            await closeCurrentSession(session.id);
            await sendTextMessage(phoneNumber, "Ficamos felizes em ajudar! O PROCON agradece seu contato. Tenha um excelente dia! ⚖️");
          }
          continue;
        }

        // Navegação de Menu Determinístico
        const optionClicked = await prisma.option.findUnique({
          where: { id: selectedOptionId },
        });

        if (optionClicked?.text.toLowerCase().includes('doc')) {
          await sendDocumentCategoryList(phoneNumber);
          continue;
        }

        if (optionClicked?.text.toLowerCase().includes('atendente virtual')) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: { isChat: true, currentStepId: null, stepState: null },
          });
          await sendTextMessage(phoneNumber, "Olá! Sou o assistente virtual. Descreva o seu problema com detalhes.");
          continue;
        }

        if (optionClicked?.nextStepId) {
          responseStep = await prisma.step.findUnique({
            where: { id: optionClicked.nextStepId },
            include: { options: true },
          });
        }
      }

      // 4. Envio de Passo do Menu Programado
      if (responseStep) {
        await prisma.userSession.update({
          where: { id: session.id },
          data: { currentStepId: responseStep.id, stepState: null },
        });

        if (responseStep.options.length > 0) {
          await sendInteractiveMessage(phoneNumber, responseStep.message, responseStep.options);
        } else {
          const humanizedText = await generateOrientativeResponse(responseStep.title, responseStep.message);
          const finalMessage = `${humanizedText}\n\nEssa resposta solucionou sua dúvida?`;
          const feedbackOptions = [
            { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
            { id: 'btn_feedback_nao', text: '👎 Não resolveu' },
          ];
          await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
        }
      }
    }
  } catch (error) {
    console.error("❌ Erro interno no WebhookController:", error);
  }
};