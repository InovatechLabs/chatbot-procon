/**
 * Processa o texto recebido de um usuário e retorna a resposta a ser enviada.
 *
 * TODO: substituir por a lógica real de atendimento do Procon
 * (registro de reclamações, consulta de status, transbordo para atendente, etc.).
 */
export function processMessage(text: string): string {
  const normalized = text.trim().toLowerCase();

  if (['oi', 'olá', 'ola', 'menu', 'início', 'inicio'].includes(normalized)) {
    return (
      '🤖 Olá! Sou o assistente virtual e recebi sua mensagem.\n\n' +
      'A integração com o WhatsApp está funcionando — o fluxo de atendimento ainda será implementado.'
    );
  }

  return `Recebemos sua mensagem: "${text}".\n\nDigite *menu* para ver as opções disponíveis.`;
}
