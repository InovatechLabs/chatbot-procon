export const DOCUMENT_GUIDES = [
    {
      categoryKey: 'CARTAO_SEGURO',
      categoryName: 'Cobrança de Seguro em Cartão de Crédito',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Faturas do cartão mostrando a cobrança desde o primeiro mês de desconto',
        'Comprovantes de pagamento das faturas',
        'Comprovantes de contato com a empresa (protocolos, e-mails ou prints), se houver',
        'CNPJ da matriz do fornecedor/banco (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'Caso haja cobrança indevida confirmada, poderá ser requerida a devolução em dobro do valor pago.'
    },
    {
      categoryKey: 'EMPRESTIMO_FOLHA',
      categoryName: 'Desconto Indevido de Empréstimo em Folha de Pagamento',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Holerite/Contracheque demonstrando os descontos indevidos',
        'Comprovante de pagamento total do empréstimo',
        'Comprovantes de pagamento e extratos bancários',
        'CNPJ da matriz do banco ou financeira (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'O pagamento total deve ser comprovado por documentos para pedir a suspensão dos descontos e a devolução.'
    },
    {
      categoryKey: 'INSS_RMC_RCC',
      categoryName: 'Desconto não Reconhecido em Benefício (INSS, RMC ou RCC)',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Extrato de empréstimos consignados (HISCON), disponível no aplicativo ou site Meu INSS',
        'Extrato bancário contendo a data do crédito do valor e dos descontos',
        'Histórico de pagamentos do benefício (Extrato de Pagamento, no Meu INSS)',
        'CNPJ da matriz da instituição financeira (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'Importante: Caso o valor do empréstimo tenha sido utilizado pelo consumidor, o PROCON atuará na solicitação de proposta de pagamento total do saldo.'
    },
    {
      categoryKey: 'CONTRATO_CANCELAMENTO',
      categoryName: 'Recusa na Entrega de Contrato ou Dificuldade no Cancelamento',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Cópia do contrato ou proposta (se fornecida)',
        'Números de protocolos de atendimento solicitando o cancelamento/documentação',
        'Comprovantes de pagamento e faturas recentes',
        'E-mails, cartas ou mensagens trocadas com o fornecedor',
        'CNPJ da matriz da empresa (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'A empresa é obrigada pelo CDC a fornecer cópia do contrato e não pode impor entraves abusivos ao cancelamento.'
    },
    {
      categoryKey: 'GARANTIA_VICIO',
      categoryName: 'Produto ou Serviço com Defeito / Problemas na Garantia',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Nota Fiscal, cupom fiscal ou comprovante de compra (extrato/pix)',
        'Termo de garantia fornecido pelo fabricante (se houver)',
        'Ordem de Serviço (OS) da assistência técnica, caso tenha permanecido mais de 30 dias para conserto',
        'Fotos ou vídeos demonstrando o vício/defeito do produto',
        'CNPJ da matriz do fornecedor e do fabricante (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'Se o defeito não for sanado em 30 dias pela assistência, você poderá optar entre a troca, cancelamento ou abatimento.'
    },
    {
      categoryKey: 'GERAL',
      categoryName: 'Outras Reclamações de Relação de Consumo',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Comprovantes da relação de consumo (notas, contratos, faturas, ordens de serviço)',
        'Prints, e-mails ou números de protocolo de tentativa de solução',
        'CNPJ da matriz do fornecedor reclamado (consulte a nota fiscal, contrato ou site da empresa)'
      ],
      observations: 'Compareça presencialmente com todos os documentos originais e cópias para a triagem formal.'
    }
  ];
