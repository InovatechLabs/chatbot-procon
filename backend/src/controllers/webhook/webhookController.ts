import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import {
  createAppointment,
  getUpcomingSlots,
  formatSlotLabel,
  AppointmentError,
} from '../../services/appointments/appointmentService.js';
import dotenv from 'dotenv';

dotenv.config();

// Título do Step do fluxo que representa o agendamento presencial (ver prisma/seed/seed.ts)
const AGENDAMENTO_STEP_TITLE = 'Fluxo Agendamento';

const agendarPromptOptions = [
  { id: 'btn_agendar_sim', text: 'Sim, quero agendar' },
  { id: 'btn_agendar_nao', text: 'Não, obrigado' }
];

// Registra no histórico (ChatLog) o que o atendente presencial precisará ler depois
const logMessage = async (
  sessionId: string,
  phoneNumber: string,
  direction: 'INBOUND' | 'OUTBOUND',
  messageText: string
) => {
  await prisma.chatLog.create({ data: { sessionId, phoneNumber, direction, messageText } });
};

// Oferece os próximos horários livres como lista do WhatsApp (ids: slot_<ISO UTC>)
const offerSlots = async (phoneNumber: string, sessionId: string) => {
  const slots = await getUpcomingSlots(8);

  if (slots.length === 0) {
    const text = 'No momento não há horários disponíveis para agendamento. Tente novamente mais tarde ou compareça à unidade do PROCON.';
    await sendTextMessage(phoneNumber, text);
    await logMessage(sessionId, phoneNumber, 'OUTBOUND', text);
    return;
  }

  const text = 'Escolha o melhor horário para o seu atendimento presencial:';
  await sendInteractiveMessage(
    phoneNumber,
    text,
    slots.map((s) => ({ id: `slot_${s.scheduledAt}`, text: s.label }))
  );
  await logMessage(sessionId, phoneNumber, 'OUTBOUND', `${text} ${slots.map((s) => s.label).join(' | ')}`);
};

// Cria o agendamento vinculado a este número (e, portanto, a toda a conversa já registrada)
const handleSlotSelection = async (phoneNumber: string, sessionId: string, isoDate: string) => {
  const scheduledAt = new Date(isoDate);

  if (Number.isNaN(scheduledAt.getTime())) {
    await offerSlots(phoneNumber, sessionId);
    return;
  }

  const label = formatSlotLabel(scheduledAt);
  await logMessage(sessionId, phoneNumber, 'INBOUND', `[Horário escolhido] ${label}`);

  try {
    await createAppointment({
      phoneNumber,
      scheduledAt,
      subject: 'Agendamento solicitado pelo WhatsApp',
      source: 'WHATSAPP'
    });

    const text = `✅ Atendimento presencial agendado para *${label}*.\n\nLeve seus documentos pessoais (RG/CPF) e os comprovantes do problema (notas, protocolos, prints, faturas). O atendente terá acesso ao histórico desta conversa.`;
    await sendTextMessage(phoneNumber, text);
    await logMessage(sessionId, phoneNumber, 'OUTBOUND', text);
  } catch (error) {
    if (error instanceof AppointmentError) {
      if (error.code === 'ALREADY_SCHEDULED') {
        const text = 'Você já possui um atendimento presencial pendente. Para alterá-lo, procure a unidade do PROCON.';
        await sendTextMessage(phoneNumber, text);
        await logMessage(sessionId, phoneNumber, 'OUTBOUND', text);
        return;
      }
      if (['SLOT_TAKEN', 'INVALID_SLOT', 'PAST_DATE'].includes(error.code)) {
        const text = 'Esse horário não está mais disponível. Vou te mostrar as opções atualizadas.';
        await sendTextMessage(phoneNumber, text);
        await logMessage(sessionId, phoneNumber, 'OUTBOUND', text);
        await offerSlots(phoneNumber, sessionId);
        return;
      }
    }
    throw error;
  }
};

export const verifyWebhook = async (req: Request, res: Response): Promise<any> => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const MY_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === MY_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  return res.sendStatus(400);
};

export const handleWebhookEvent = async (req: Request, res: Response): Promise<any> => {
  const { body } = req;

  if (body.object === 'whatsapp_business_account') {
    res.status(200).send('EVENT_RECEIVED');

    try {
      for (const entry of body.entry) {
        const changes = entry.changes[0].value;
        
        if (changes.messages && changes.messages.length > 0) {
          const message = changes.messages[0];
          const phoneNumber = message.from;
          let responseStep = null;

          // ==========================================================
          // 1. GERENCIAMENTO DE SESSÃO (BUSCAR OU CRIAR)
          // ==========================================================
          let session = await prisma.userSession.findUnique({
            where: { phoneNumber }
          });

          if (!session) {
            session = await prisma.userSession.create({
              data: { phoneNumber, isChat: false, status: 'OPEN' }
            });
          }

          if (session.status !== 'OPEN') {
             session = await prisma.userSession.update({
               where: { id: session.id },
               data: { status: 'OPEN', isChat: false, currentStepId: null }
             });
          }

          // ==========================================================
          // 2. TRATAMENTO DE TEXTO (MENSAGENS DIGITADAS)
          // ==========================================================
          if (message.type === 'text') {
            const originalText = message.text.body;
            const userText = originalText.toLowerCase().trim();
            console.log(`💬 Texto de ${phoneNumber}: ${userText}`);

            await prisma.chatLog.create({
              data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'INBOUND', messageText: originalText }
            });

            const escapeCommands = ['menu', 'sair', 'voltar', 'cancelar', 'iniciar'];
            if (escapeCommands.includes(userText)) {
              session = await prisma.userSession.update({
                where: { id: session.id },
                data: { isChat: false, currentStepId: null }
              });
            }

            // --- BIFURCAÇÃO DE ESTADO ---
            if (session.isChat === true) {
              // 🔴 MODO IA ATIVADO: Ignora tudo e vai pro RAG
              await sendTextMessage(phoneNumber, "⏳ *Estou pesquisando sua situação no Código de Defesa do Consumidor...*");
              
              const ragResult = await answerWithRAG(originalText, session.id); 
              
              // Salva APENAS o texto no banco, o "raciocinio" fica oculto!
              await prisma.chatLog.create({
                data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'OUTBOUND', messageText: ragResult.texto }
              });

              // Roteamento baseado no JSON Schema
              if (ragResult.tipoResposta === 'redirecionamento') {
                const agendamentoOptions = [
                  { id: 'btn_agendar_sim', text: 'Sim, quero agendar' },
                  { id: 'btn_agendar_nao', text: 'Não, obrigado' }
                ];
                await sendInteractiveMessage(phoneNumber, ragResult.texto, agendamentoOptions);
              } 
              else if (ragResult.tipoResposta === 'clarificacao') {
                await sendTextMessage(phoneNumber, ragResult.texto);
              } 
              else {
                // orientacao_final
                const finalMessage = ragResult.texto + '\n\nEssa orientação solucionou sua dúvida?';
                const feedbackOptions = [
                  { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                  { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
                ];
                await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
              }

            } else {
              const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'];

              if (greetings.includes(userText) || escapeCommands.includes(userText)) {
                responseStep = await prisma.step.findFirst({
                  where: { isStart: true },
                  include: { options: true },
                });
              } else {
                // Se mandou reclamação direta sem passar pelo menu
                session = await prisma.userSession.update({
                  where: { id: session.id },
                  data: { isChat: true }
                });

                await sendTextMessage(phoneNumber, "⏳ *Analisando seu relato...*");
                
                const ragResult = await answerWithRAG(originalText, session.id);
                
                await prisma.chatLog.create({
                  data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'OUTBOUND', messageText: ragResult.texto }
                });

                // Roteamento baseado no JSON Schema (agora seguro para os 3 casos!)
                if (ragResult.tipoResposta === 'redirecionamento') {
                  const agendamentoOptions = [
                    { id: 'btn_agendar_sim', text: 'Sim, quero agendar' },
                    { id: 'btn_agendar_nao', text: 'Não, obrigado' }
                  ];
                  await sendInteractiveMessage(phoneNumber, ragResult.texto, agendamentoOptions);
                } 
                else if (ragResult.tipoResposta === 'clarificacao') {
                  await sendTextMessage(phoneNumber, ragResult.texto);
                } 
                else {
                  // orientacao_final
                  const finalMessage = ragResult.texto + '\n\nEssa orientação solucionou sua dúvida?';
                  const feedbackOptions = [
                    { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                    { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
                  ];
                  await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
                }
                continue;
              }
            }
          }
          
          // ==========================================================
          // 3. TRATAMENTO DE BOTÕES (INTERACTIVE)
          // ==========================================================
          else if (message.type === 'interactive') {
            let selectedOptionId = null;

            if (message.interactive.type === 'button_reply') {
              selectedOptionId = message.interactive.button_reply.id;
            } else if (message.interactive.type === 'list_reply') {
              selectedOptionId = message.interactive.list_reply.id;
            }

            if (selectedOptionId === 'btn_feedback_sim' || selectedOptionId === 'btn_feedback_nao') {
              const resolveu = selectedOptionId === 'btn_feedback_sim';
              
              console.log(`Feedback ${resolveu ? 'Positivo' : 'Negativo'} de ${phoneNumber}`);
              
              await prisma.userSession.update({
                where: { id: session.id },
                data: { 
                  status: 'RESOLVED',
                  isChat: false,
                  rating: resolveu ? 5 : 1
                }
              });

              if (resolveu) {
                await sendTextMessage(phoneNumber, "Ficamos felizes em ajudar! O PROCON agradece o seu contato. Tenha um ótimo dia!");
              } else {
                const text = 'Entendo. Para melhor auxiliá-lo, sugerimos um atendimento presencial em nossa unidade. Deseja agendar?';
                await sendInteractiveMessage(phoneNumber, text, agendarPromptOptions);
                await logMessage(session.id, phoneNumber, 'OUTBOUND', text);
              }
              continue; 
            }

            // --- AGENDAMENTO PRESENCIAL (botões enviados após o RAG ou o feedback negativo) ---
            if (selectedOptionId === 'btn_agendar_nao') {
              const text = 'Tudo bem! Se precisar de ajuda, é só enviar uma mensagem. O PROCON agradece o seu contato.';
              await logMessage(session.id, phoneNumber, 'INBOUND', '[Botão] Não, obrigado');
              await sendTextMessage(phoneNumber, text);
              await logMessage(session.id, phoneNumber, 'OUTBOUND', text);
              continue;
            }

            if (selectedOptionId === 'btn_agendar_sim') {
              await logMessage(session.id, phoneNumber, 'INBOUND', '[Botão] Sim, quero agendar');
              await offerSlots(phoneNumber, session.id);
              continue;
            }

            if (typeof selectedOptionId === 'string' && selectedOptionId.startsWith('slot_')) {
              await handleSlotSelection(phoneNumber, session.id, selectedOptionId.slice('slot_'.length));
              continue;
            }

            if (selectedOptionId) {
              console.log(`👆 Clique no ID: ${selectedOptionId}`);
              
              const optionClicked = await prisma.option.findUnique({
                where: { id: selectedOptionId },
              });

              if (optionClicked && optionClicked.text.toLowerCase().includes('atendente virtual')) {
                  await prisma.userSession.update({
                     where: { id: session.id },
                     data: { isChat: true }
                  });
                  await sendTextMessage(phoneNumber, "Olá! Sou o assistente virtual. Por favor, descreva o seu problema de forma clara e objetiva.");
                  continue;
              }

              if (optionClicked && optionClicked.nextStepId) {
                responseStep = await prisma.step.findUnique({
                  where: { id: optionClicked.nextStepId },
                  include: { options: true },
                });
              }
            }
          }

          // ==========================================================
          // 4. ENVIO FINAL (Se for um Step do fluxo programado)
          // ==========================================================
          if (responseStep && responseStep.title === AGENDAMENTO_STEP_TITLE) {
            await prisma.userSession.update({
              where: { id: session.id },
              data: { currentStepId: responseStep.id }
            });
            await offerSlots(phoneNumber, session.id);
          } else if (responseStep) {
            await prisma.userSession.update({
              where: { id: session.id },
              data: { currentStepId: responseStep.id }
            });

            if (responseStep.options.length > 0) {
              await sendInteractiveMessage(phoneNumber, responseStep.message, responseStep.options);
            } else {        
              const path = responseStep.title; 
              const humanizedText = await generateOrientativeResponse(path, responseStep.message);

              const finalMessage = humanizedText + '\n\nEssa resposta solucionou sua dúvida?';
              const feedbackOptions = [
                { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
              ];

              await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
            }
          }
        }
      }
    } catch (error) {
      console.error("Erro interno no WebhookController:", error);
    }
    return;
  }

  return res.sendStatus(404);
};