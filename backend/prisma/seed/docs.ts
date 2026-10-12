    import { prisma } from '../../src/database/index.js';

    export const seedDocumentGuides = async () => {
  console.log('🌱 Populando guias de documentos obrigatórios...');

  const guides = [
    {
      categoryKey: 'CARTAO_SEGURO',
      categoryName: 'Cobrança de Seguro em Cartão de Crédito',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Faturas do cartão mostrando a cobrança desde o primeiro mês de desconto',
        'Comprovantes de pagamento das faturas',
        'Comprovantes de contato com a empresa (protocolos, e-mails ou prints), se houver',
        'CNPJ da matriz do fornecedor/banco'
      ],
      observations: 'Caso haja cobrança indevida confirmada, poderá ser requerida a devolução em dobro do valor pago.'
    },
    {
      categoryKey: 'EMPRESTIMO_FOLHA',
      categoryName: 'Desconto Indevido de Empréstimo em Folha de Pagamento',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Holerite/Contracheque demonstrando os descontos indevidos',
        'Comprovante de quitação integral do empréstimo',
        'Comprovantes de pagamento e extratos bancários',
        'CNPJ da matriz do banco ou financeira'
      ],
      observations: 'A quitação prévia deve ser comprovada documentalmente para requerer a suspensão imediata e restituição.'
    },
    {
      categoryKey: 'INSS_RMC_RCC',
      categoryName: 'Desconto não Reconhecido em Benefício (INSS, RMC ou RCC)',
      requiredDocs: [
        'Documento oficial de identificação (RG e CPF)',
        'Extrato detalhado do benefício consignado do INSS (HISCON)',
        'Extrato bancário contendo a data do crédito do valor e dos descontos',
        'Histórico de crédito completo',
        'CNPJ da matriz da instituição financeira'
      ],
      observations: 'Importante: Caso o valor do empréstimo tenha sido utilizado pelo consumidor, o PROCON atuará na solicitação de proposta de quitação do saldo.'
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
        'CNPJ da matriz da empresa'
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
        'CNPJ da matriz do fornecedor e do fabricante'
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
        'CNPJ da matriz do fornecedor reclamado'
      ],
      observations: 'Compareça presencialmente com todos os documentos originais e cópias para a triagem formal.'
    }
  ];

  for (const guide of guides) {
    await prisma.documentGuide.upsert({
      where: { categoryKey: guide.categoryKey },
      update: guide,
      create: guide
    });
  }

  console.log('✅ Guias de documentos populados com sucesso!');
};

if (process.argv[1] == undefined) {
  throw new Error('process is undefined. This script should be run in a Node.js environment.');
}
// Executa diretamente se o arquivo for chamado
if (process.argv[1].endsWith('docs.ts')) {
  seedDocumentGuides()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}