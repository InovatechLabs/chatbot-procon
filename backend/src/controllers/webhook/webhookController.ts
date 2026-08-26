import type { Request, Response } from 'express';
import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import dotenv from 'dotenv';

dotenv.config();

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

          // Se a sessão estava fechada (RESOLVED/CLOSED), reabrimos
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

            // Salva o texto no histórico IMEDIATAMENTE
            await prisma.chatLog.create({
              data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'INBOUND', messageText: originalText }
            });

            // COMANDOS DE FUGA (Para sair do chat livre)
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
              
              const ragResponse = await answerWithRAG(originalText, session.id); 
              
              // Salva a resposta do Bot
              await prisma.chatLog.create({
                data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'OUTBOUND', messageText: ragResponse }
              });

              if (ragResponse.includes('[AGENDAR]')) {
                const cleanMessage = ragResponse.replace('[AGENDAR]', '').trim();
                
                const agendamentoOptions = [
                  { id: 'btn_agendar_sim', text: 'Sim, quero agendar' },
                  { id: 'btn_agendar_nao', text: 'Não, obrigado' }
                ];
                await sendInteractiveMessage(phoneNumber, cleanMessage, agendamentoOptions);
              }

              const isClarification = ragResponse.includes('?');

              if (isClarification) {
                await sendTextMessage(phoneNumber, ragResponse);
              } else {
                const finalMessage = ragResponse + '\n\nEssa orientação solucionou sua dúvida?';
                const feedbackOptions = [
                  { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                  { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
                ];

                await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
              }

            } else {
              const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite'];

              if (greetings.includes(userText) || escapeCommands.includes(userText)) {
                // Se for saudação ou fuga, manda o Menu de botões normais
                responseStep = await prisma.step.findFirst({
                  where: { isStart: true },
                  include: { options: true },
                });
              } else {
                // Se não deu saudação, mas já mandou texto solto (reclamação direta), ativa IA
                session = await prisma.userSession.update({
                  where: { id: session.id },
                  data: { isChat: true }
                });

                await sendTextMessage(phoneNumber, "⏳ *Analisando seu relato...*");
                
                const ragResponse = await answerWithRAG(originalText, session.id);
                
                await prisma.chatLog.create({
                  data: { sessionId: session.id, phoneNumber: phoneNumber, direction: 'OUTBOUND', messageText: ragResponse }
                });

                const isClarification = ragResponse.includes('?');
                if (isClarification) {
                  await sendTextMessage(phoneNumber, ragResponse);
                } else {              
                const finalMessage = ragResponse + '\n\nEssa orientação solucionou sua dúvida?';
                const feedbackOptions = [
                  { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                  { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
                ];
                await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
                continue;
                }
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

            // TRATAMENTO DE FEEDBACK (Finaliza o atendimento)
            if (selectedOptionId === 'btn_feedback_sim' || selectedOptionId === 'btn_feedback_nao') {
              const resolveu = selectedOptionId === 'btn_feedback_sim';
              
              console.log(`Feedback ${resolveu ? 'Positivo' : 'Negativo'} de ${phoneNumber}`);
              
              // Atualiza a sessão para fechada e salva a nota provisória
              await prisma.userSession.update({
                where: { id: session.id },
                data: { 
                  status: 'RESOLVED',
                  isChat: false,
                  rating: resolveu ? 5 : 1 // Exemplo: 5 pra sim, 1 pra não.
                }
              });

              if (resolveu) {
                await sendTextMessage(phoneNumber, "Ficamos felizes em ajudar! O PROCON agradece o seu contato. Tenha um ótimo dia!");
              } else {
                const stepAgendamento = await prisma.step.findFirst({
                  where: { title: 'Fluxo Agendamento' } // Ou busque por um isAgendamento flag
                });
                
                if (stepAgendamento) {
                  await sendTextMessage(phoneNumber, stepAgendamento.message);
                } else {
                   await sendTextMessage(phoneNumber, "Entendo. Para melhor auxiliá-lo, sugerimos o agendamento presencial em nossa unidade.");
                }
              }
              continue; 
            }

            // TRATAMENTO DE NAVEGAÇÃO DE MENU NORMAL
            if (selectedOptionId) {
              console.log(`👆 Clique no ID: ${selectedOptionId}`);
              
              // Verifica se clicou na opção de ir pro chat livre (Adapte o ID/Texto conforme seu banco)
              const optionClicked = await prisma.option.findUnique({
                where: { id: selectedOptionId },
              });

              // SE CLICAR NA OPÇÃO DE "ATENDIMENTO COM IA"
              // (Você precisa checar como essa opção é identificada no seu DB)
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
          if (responseStep) {
            // Atualiza o passo atual na sessão
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