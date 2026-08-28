import { prisma } from '../../database/index.js';
import { sendTextMessage, sendInteractiveMessage } from '../../services/metaAPI.js';
import { answerWithRAG, generateOrientativeResponse } from '../../services/llm/llmService.js';
import dotenv from 'dotenv';
dotenv.config();
export const verifyWebhook = async (req, res) => {
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
export const handleWebhookEvent = async (req, res) => {
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
                    if (message.type === 'text') {
                        const userText = message.text.body.toLowerCase().trim();
                        console.log(`💬 Texto de ${phoneNumber}: ${userText}`);
                        const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'ajuda', 'iniciar'];
                        // Se for saudação, manda o Menu de botões normais
                        if (greetings.includes(userText)) {
                            responseStep = await prisma.step.findFirst({
                                where: { isStart: true },
                                include: { options: true },
                            });
                        }
                        // ==========================================================
                        // NOVO FLUXO: CHAT LIVRE (RAG)
                        // ==========================================================
                        else {
                            await sendTextMessage(phoneNumber, "⏳ *Estou pesquisando sua situação no Código de Defesa do Consumidor...*");
                            const ragResponse = await answerWithRAG(userText);
                            const finalMessage = ragResponse + '\n\nEssa orientação solucionou sua dúvida?';
                            const feedbackOptions = [
                                { id: 'btn_feedback_sim', text: '👍 Sim, resolveu' },
                                { id: 'btn_feedback_nao', text: '👎 Não resolveu' }
                            ];
                            await sendInteractiveMessage(phoneNumber, finalMessage, feedbackOptions);
                            continue;
                        }
                    }
                    else if (message.type === 'interactive') {
                        let selectedOptionId = null;
                        if (message.interactive.type === 'button_reply') {
                            selectedOptionId = message.interactive.button_reply.id;
                        }
                        else if (message.interactive.type === 'list_reply') {
                            selectedOptionId = message.interactive.list_reply.id;
                        }
                        if (selectedOptionId === 'btn_feedback_sim') {
                            console.log(`Feedback Positivo de ${phoneNumber}`);
                            await sendTextMessage(phoneNumber, "Ficamos felizes em ajudar! O PROCON agradece o seu contato. Tenha um ótimo dia!");
                            continue;
                        }
                        else if (selectedOptionId === 'btn_feedback_nao') {
                            console.log(`Feedback Negativo de ${phoneNumber}. Direcionando para agendamento...`);
                            const stepAgendamento = await prisma.step.findFirst({
                                where: { title: 'Fluxo Agendamento' }
                            });
                            if (stepAgendamento) {
                                await sendTextMessage(phoneNumber, stepAgendamento.message);
                            }
                            continue;
                        }
                        if (selectedOptionId) {
                            console.log(`👆 Clique no ID: ${selectedOptionId}`);
                            const optionClicked = await prisma.option.findUnique({
                                where: { id: selectedOptionId },
                            });
                            if (optionClicked && optionClicked.nextStepId) {
                                responseStep = await prisma.step.findUnique({
                                    where: { id: optionClicked.nextStepId },
                                    include: { options: true },
                                });
                            }
                        }
                    }
                    if (responseStep) {
                        if (responseStep.options.length > 0) {
                            await sendInteractiveMessage(phoneNumber, responseStep.message, responseStep.options);
                        }
                        else {
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
        }
        catch (error) {
            console.error("Erro interno no WebhookController:", error);
        }
        return;
    }
    return res.sendStatus(404);
};
//# sourceMappingURL=webhookController.js.map