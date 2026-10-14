import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage, sendListMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import { getAvailableSlots, createAppointment, getPendingAppointment } from '../../services/schedule/scheduleService.js';
import { sendDocumentCategoryList, handleDocumentCategorySelection } from '../../services/documents/documentService.js';
import { cleanAndValidateCpf, getNextBusinessDays, validateFullName } from '../../utils/validators/index.js';
import dotenv from 'dotenv';

dotenv.config();

export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

const closeCurrentSession = async (sessionId: string) => {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { status: 'RESOLVED', isChat: false, currentStepId: null, stepState: null },
  });
};  

/**
 * Dispara a triagem de categoria via Lista Interativa (evita duplicação de mensagens de botões).
 */
const triggerCategorySelection = async (phoneNumber: string, sessionId: string) => {

  const pending = await getPendingAppointment(phoneNumber);

  if (pending) {
    const dateFormatted = pending.scheduledAt.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const timeFormatted = pending.scheduledAt.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const pendingMsg = `⚠️ *Você já possui um agendamento pendente no PROCON!*

📅 *Data:* ${dateFormatted}
⏰ *Horário:* ${timeFormatted}
📋 *Assunto:* ${pending.categoryName}
👤 *Nome:* ${pending.userName}

Para garantir a organização dos atendimentos, cada cidadão pode manter apenas um agendamento ativo por vez. Se precisar de orientações sobre o seu caso, você pode mandar sua dúvida por texto aqui a qualquer momento.`;

    await sendTextMessage(phoneNumber, pendingMsg);
    return;
  }
  
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { stepState: 'SCH_STEP_CAT_SELECT', currentStepId: null, isChat: false },
  });

  await sendListMessage(
    phoneNumber,
    '📋 Triagem de Agendamento',
    'Para iniciarmos o seu agendamento presencial, selecione abaixo a categoria que melhor descreve o seu problema:',
    'Ver Categorias',
    [
      {
        title: 'Cobranças e Benefícios',
        rows: [
          { id: 'btn_sch_cat_CARTAO_SEGURO', title: 'Seguro em Cartão', description: 'Cobrança não contratada em fatura' },
          { id: 'btn_sch_cat_EMPRESTIMO_FOLHA', title: 'Empréstimo em Folha', description: 'Desconto de contrato quitado' },
          { id: 'btn_sch_cat_INSS_RMC_RCC', title: 'Desconto INSS / RMC', description: 'Descontos de empréstimo ou RMC/RCC' },
        ],
      },
      {
        title: 'Outros Temas',
        rows: [
          { id: 'btn_sch_cat_CONTRATO_CANCELAMENTO', title: 'Contratos / Cancelamento', description: 'Dificuldades com planos e serviços' },
          { id: 'btn_sch_cat_GARANTIA_VICIO', title: 'Garantia e Defeito', description: 'Produtos com defeito ou sem suporte' },
          { id: 'btn_sch_cat_GERAL', title: 'Outros Assuntos', description: 'Demais dúvidas e reclamações' },
        ],
      },
    ]
  );
};

const sendRagResponseWithCheck = async (phoneNumber: string, ragResult: any, sessionId: string) => {
  const pending = await getPendingAppointment(phoneNumber);
  let messageToDisplay = ragResult.texto;

  if (ragResult.tipoResposta === 'redirecionamento') {
    if (pending) {
      const dateFormatted = pending.scheduledAt.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const timeFormatted = pending.scheduledAt.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      // Substitui o texto pelo aviso fixo de pendência
      messageToDisplay = `⚠️ *Você já possui um agendamento presencial pendente no PROCON!*

📅 *Data:* ${dateFormatted}
⏰ *Horário:* ${timeFormatted}
📋 *Assunto:* ${pending.categoryName}

Para garantir a organização da agenda, cada cidadão pode manter apenas um agendamento ativo por vez. Não é possível realizar uma nova marcação até que a consulta atual seja concluída ou resolvida.

Se precisar de orientações adicionais ou tirar dúvidas até o dia do atendimento, pode continuar digitando por escrito aqui a qualquer momento!`;

      const options = [
        { id: 'btn_feedback_sim', text: '👍 Entendi' },
        { id: 'btn_go_menu', text: '📋 Menu Principal' },
      ];

      await sendInteractiveMessage(phoneNumber, messageToDisplay, options);
    } else {
      const options = [
        { id: 'btn_agendar_sim', text: '📅 Agendar Consulta' },
        { id: 'btn_agendar_nao', text: 'Não, obrigado' },
      ];
      await sendInteractiveMessage(phoneNumber, messageToDisplay, options);
    }
  } else if (ragResult.tipoResposta === 'clarificacao') {
    await sendTextMessage(phoneNumber, messageToDisplay);
  } else {
    messageToDisplay = `${ragResult.texto}\n\nEssa orientação solucionou sua dúvida?`;
    const feedbackOptions = [
      { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
      { id: 'btn_feedback_nao', text: '👎 Não resolveu' },
    ];
    await sendInteractiveMessage(phoneNumber, messageToDisplay, feedbackOptions);
  }

  await prisma.chatLog.create({
    data: { sessionId, phoneNumber, direction: 'OUTBOUND', messageText: messageToDisplay },
  });
};

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

      const SESSION_TIMEOUT_MINUTES = 30;

      let session = await prisma.userSession.findFirst({
        where: { phoneNumber, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });

      if (session) {
        const now = new Date();
        const diffInMinutes = (now.getTime() - new Date(session.updatedAt).getTime()) / (1000 * 60);

        if (diffInMinutes > SESSION_TIMEOUT_MINUTES) {
          await closeCurrentSession(session.id);
          session = null;
        }
      }

      if (!session) {
        session = await prisma.userSession.create({
          data: { phoneNumber, isChat: false, status: 'OPEN' },
        });
      }

      // PROCESSAMENTO DE TEXTO LIVRE
      if (message.type === 'text') {
        const originalText = message.text.body;
        const userText = originalText.toLowerCase().trim();

        await prisma.chatLog.create({
          data: { sessionId: session.id, phoneNumber, direction: 'INBOUND', messageText: originalText },
        });

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

          if (!validateFullName(userName)) {
            await sendTextMessage(
              phoneNumber,
              "⚠️ *Nome inválido!* Por favor, digite o seu *Nome Completo* (Nome e Sobrenome, sem números ou símbolos):"
            );
            continue;
          }

          // Grava o nome no campo da sessão e avança o estado de forma limpa
          await prisma.userSession.update({
            where: { id: session.id },
            data: { 
              userName, 
              stepState: `SCH_STEP_CPF:${categoryKey}`, 
              currentStepId: null 
            },
          });

          await sendTextMessage(phoneNumber, `Obrigado, *${userName}*!\n\nAgora, por favor, digite o seu *CPF* (apenas números ou formatado):`);
          continue;
        }

        // Estado: Coleta de CPF
        if (session.stepState?.startsWith('SCH_STEP_CPF:')) {
          const categoryKey = session.stepState.replace('SCH_STEP_CPF:', '');

          const validCpf = cleanAndValidateCpf(originalText);
          if (!validCpf) {
            await sendTextMessage(
              phoneNumber, 
              "⚠️ *CPF Inválido!* O CPF digitado não é válido. Por favor, digite um CPF correto contendo 11 dígitos (ex: 123.456.789-00):"
            );
            continue;
          }

          // Grava o CPF no campo da sessão
          await prisma.userSession.update({
            where: { id: session.id },
            data: { 
              userCpf: validCpf, 
              stepState: `SCH_STEP_DATE:${categoryKey}`, 
              currentStepId: null 
            },
          });

          const nextDays = getNextBusinessDays(5);
          const dateRows = nextDays.map((d) => ({
            id: `btn_sch_date_${d.dateStr}`,
            title: d.label,
            description: `Atendimento presencial em ${d.dateStr.split('-').reverse().join('/')}`
          }));

          await sendListMessage(
            phoneNumber,
            '📅 Datas Disponíveis',
            `CPF *${validCpf}* registrado com sucesso!\n\nPor favor, selecione o dia de sua preferência para o atendimento presencial no PROCON:`,
            'Ver Datas',
            [{ title: 'Próximos Dias Úteis', rows: dateRows }]
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

          await sendRagResponseWithCheck(phoneNumber, ragResult, session.id);
          continue;
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

            await sendRagResponseWithCheck(phoneNumber, ragResult, session.id);
            continue;
          }
        }
      }

      // PROCESSAMENTO DE BOTÕES E OPÇÕES INTERATIVAS
else if (message.type === 'interactive') {
        let selectedOptionId: string | null = null;

        if (message.interactive.type === 'button_reply') {
          selectedOptionId = message.interactive.button_reply.id;
        } else if (message.interactive.type === 'list_reply') {
          selectedOptionId = message.interactive.list_reply.id;
        }

        if (!selectedOptionId) continue;

        if (selectedOptionId === 'btn_go_menu') {
          await prisma.userSession.update({
            where: { id: session.id },
            data: { isChat: false, currentStepId: null, stepState: null },
          });

          const startStep = await prisma.step.findFirst({
            where: { isStart: true },
            include: { options: true },
          });

          if (startStep) {
            await prisma.userSession.update({
              where: { id: session.id },
              data: { currentStepId: startStep.id },
            });

            await sendInteractiveMessage(phoneNumber, startStep.message, startStep.options);
          }
          continue;
        }

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
            "Entendido! Antes de encerrar, como você avalia o atendimento do nosso assistente virtual hoje?",
            ratingOptions
          );
          continue;
        }

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

        if (selectedOptionId.startsWith('doc_req_')) {
          await handleDocumentCategorySelection(phoneNumber, selectedOptionId);
          continue;
        }

        if (selectedOptionId.startsWith('btn_sch_cat_')) {
          const categoryKey = selectedOptionId.replace('btn_sch_cat_', '');
          await prisma.userSession.update({
            where: { id: session.id },
            data: { stepState: `SCH_STEP_NAME:${categoryKey}`, currentStepId: null },
          });

          await sendTextMessage(phoneNumber, "Para iniciarmos seu agendamento, por favor, digite o seu *Nome Completo*:");
          continue;
        }

        if (selectedOptionId.startsWith('btn_sch_date_')) {
          const selectedDate = selectedOptionId.replace('btn_sch_date_', '');
          if (!session.stepState?.startsWith('SCH_STEP_DATE:')) {
            await sendTextMessage(phoneNumber, "Sessão de agendamento expirada. Digite *menu* para recomeçar.");
            continue;
          }

          const categoryKey = session.stepState.replace('SCH_STEP_DATE:', '');
          const availableSlots = await getAvailableSlots(selectedDate);

          if (availableSlots.length === 0) {
            await sendTextMessage(phoneNumber, "⚠️ Não há horários vagos para esta data. Por favor, escolha outro dia:");

            const nextDays = getNextBusinessDays(5);
            const dateRows = nextDays.map((d) => ({
              id: `btn_sch_date_${d.dateStr}`,
              title: d.label,
              description: `Atendimento em ${d.dateStr.split('-').reverse().join('/')}`
            }));

            await sendListMessage(
              phoneNumber,
              '📅 Escolha outra Data',
              'Não encontramos horários para a data selecionada. Escolha outro dia:',
              'Ver Datas',
              [{ title: 'Datas Disponíveis', rows: dateRows }]
            );
            continue;
          }

          await prisma.userSession.update({
            where: { id: session.id },
            data: { stepState: `SCH_STEP_SLOT:${categoryKey}:${selectedDate}`, currentStepId: null },
          });

          const slotRows = availableSlots.slice(0, 10).map((slot) => ({
            id: `btn_sch_slot_${slot.dateTimeIso}`,
            title: `Horário: ${slot.time}`,
            description: 'Vaga disponível para atendimento presencial'
          }));

          const [yyyy, mm, dd] = selectedDate.split('-');

          await sendListMessage(
            phoneNumber,
            '⏰ Horários Disponíveis',
            `Horários livres para o dia *${dd}/${mm}/${yyyy}*:\n\nSelecione o melhor horário para você:`,
            'Ver Horários',
            [{ title: 'Horários para Agendamento', rows: slotRows }]
          );
          continue;
        }

        if (selectedOptionId.startsWith('btn_sch_slot_')) {
          const dateTimeIso = selectedOptionId.replace('btn_sch_slot_', '');
          if (!session.stepState?.startsWith('SCH_STEP_SLOT:')) {
            await sendTextMessage(phoneNumber, "Sessão expirada. Digite *menu* para recomeçar.");
            continue;
          }

          const parts = session.stepState.split(':');
          const categoryKey = parts[1] ?? 'GERAL';

          const userName = session.userName ?? 'Cidadão';
          const userCpf = session.userCpf ?? '000.000.000-00';

          const appointment = await createAppointment({
            sessionId: session.id,
            categoryKey,
            userName,
            userCpf,
            phoneNumber,
            scheduledAtIso: dateTimeIso,
            issueSummary: 'Solicitado via Atendente Virtual WhatsApp',
          });

          await prisma.userSession.update({
            where: { id: session.id },
            data: { stepState: null, currentStepId: null },
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
            hour12: false
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

*Documentos obrigatórios para a consulta:*
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
            await sendTextMessage(phoneNumber, "Ficamos felizes em ajudar! O PROCON agradece seu contato. Tenha um excelente dia!");
          }
          continue;
        }

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

      else {
        await sendTextMessage(
          phoneNumber,
          "No momento, consigo responder apenas a *mensagens de texto* ou *seleções nos botões dos menus*. Por favor, envie sua dúvida por escrito para que eu possa te ajudar!"
        );
      }

      // Envio de Passo do Menu Programado
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