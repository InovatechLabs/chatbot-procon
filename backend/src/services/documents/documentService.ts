import { sendListMessage, sendTextMessage } from '../metaAPI.js';

/**
 * Dispara a lista interativa de categorias de documentos.
 */
export const sendDocumentCategoryList = async (phoneNumber: string) => {
  const sections = [
    {
      title: 'Assuntos Frequentes',
      rows: [
        { id: 'doc_req_cartao', title: 'Seguro em Cartão', description: 'Cobrança indevida em fatura' },
        { id: 'doc_req_folha', title: 'Empréstimo em Folha', description: 'Desconto de contrato já quitado' },
        { id: 'doc_req_inss', title: 'Benefício INSS / RMC', description: 'Descontos de empréstimo ou RMC/RCC' },
        { id: 'doc_req_contrato', title: 'Contratos e Telefonia', description: 'Recusa de contrato ou cancelamento' },
        { id: 'doc_req_geral', title: 'Outras Reclamações', description: 'Documentos padrão para demais casos' },
      ],
    },
  ];

  await sendListMessage(
    phoneNumber,
    '📋 Guia de Documentos PROCON',
    'Selecione o assunto para visualizar a lista exata de documentos exigidos presencialmente:',
    'Ver Categorias',
    sections
  );
};

/**
 * Processa a seleção do usuário na lista e retorna o checklist correspondente.
 */
export const handleDocumentCategorySelection = async (phoneNumber: string, selectedOptionId: string) => {
  let docText = '';

  switch (selectedOptionId) {
    case 'doc_req_cartao':
      docText = `📋 *Documentos Obrigatórios — Seguro em Cartão não contratado:*

• Documento oficial com foto (RG e CPF)
• Faturas do cartão detalhando as cobranças desde o primeiro desconto
• Comprovantes de pagamento das faturas
• Protocolos de atendimento, mensagens ou e-mails de cobrança
• CNPJ da matriz do fornecedor/banco`;
      break;

    case 'doc_req_folha':
      docText = `📋 *Documentos Obrigatórios — Empréstimo Quitado em Folha:*

• Documento oficial com foto (RG e CPF)
• Holerites/Folha de pagamento com os descontos indevidos
• Comprovante de quitação do empréstimo
• Protocolos, e-mails ou mensagens trocadas com o banco
• CNPJ da matriz da instituição financeira`;
      break;

    case 'doc_req_inss':
      docText = `📋 *Documentos Obrigatórios — Empréstimo / RMC / RCC no INSS:*

• Documento oficial com foto (RG e CPF)
• Extrato consignado atualizado do INSS
• Extrato bancário demonstrando a data de inclusão do valor
• Histórico de crédito do benefício
• CNPJ da matriz do banco

💡 *Aviso:* Se você tiver utilizado o valor depositado, o PROCON atuará solicitando uma proposta de quitação.`;
      break;

    case 'doc_req_contrato':
      docText = `📋 *Documentos Obrigatórios — Contratos e Cancelamento de Telefonia:*

• Documento oficial com foto (RG e CPF)
• Cópias do contrato ou números de protocolo solicitando a via
• Comprovantes de pagamento das últimas faturas
• Protocolos de atendimento exigindo o cancelamento do serviço
• CNPJ da matriz da operadora/empresa`;
      break;

    default:
      docText = `📋 *Documentos Gerais para Abertura de Reclamação:*

• Documento oficial com foto (RG e CPF)
• CNPJ da matriz da empresa reclamada
• Comprovantes do problema (notas fiscais, faturas, contratos, ordens de serviço, prints)
• Números de protocolo de atendimento junto ao fornecedor`;
      break;
  }

  const followUpMessage = `${docText}\n\nPara consultar outra opção, selecione-a no menu Guia de Documentos.`;


  await sendTextMessage(phoneNumber, followUpMessage);
};