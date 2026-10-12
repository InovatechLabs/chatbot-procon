import { prisma } from '../../src/database/index.js';

async function main() {
  console.log('Iniciando o seed do banco de dados...');

  // Limpa o banco para evitar duplicidades
  await prisma.userSession.deleteMany({});
  await prisma.option.deleteMany({});
  await prisma.step.deleteMany({});

  // =========================================================================
  // NÍVEL 1: MENU PRINCIPAL (3 BOTÕES CLICÁVEIS)
  // =========================================================================
  const menuPrincipal = await prisma.step.create({
    data: {
      title: 'Menu Principal',
      message: `Olá! Sou o assistente virtual do PROCON e estou aqui para te ajudar.

Escolha uma das opções nos botões abaixo:

📚 *Entender um direito:* Explore as regras do Código de Defesa do Consumidor por temas e categorias.
📋 *Documentos Necessários:* Veja a lista exata de documentos exigidos para abrir uma reclamação.
📑 *Processos & Queixas:* Entenda prazos, audiências e como funciona o atendimento do PROCON.

✍️ *Contando o seu problema:* A qualquer momento, você pode digitar o que aconteceu. \n\n💡 *Dica:* Ao digitar, explique a situação com detalhes (o que você comprou/contratou, quando foi e o que deu errado). Irei analisar seu caso e te orientar da melhor forma possível.\n\n🔒 *Sua privacidade está garantida:* Seus dados não serão enviados nem compartilhados com terceiros, e serão utilizados exclusivamente para seu atendimento.\n\nComo posso te ajudar hoje?`,
      isStart: true,
    },
  });

  // =========================================================================
  // NÍVEL 1.5: SUBMENUS
  // =========================================================================

  const submenuConceitos = await prisma.step.create({
    data: {
      title: 'Submenu Entender Direitos',
      message: '*Sobre o que você quer entender melhor?*\n\nSelecione o tema de seu interesse:',
    },
  });

  const categoriaProcesso = await prisma.step.create({
    data: {
      title: 'Processo Queixa',
      message: '*Processo da Reclamação no Procon*\n\nSelecione o assunto de seu interesse para entender prazos e regras:',
    },
  });

  // =========================================================================
  // NÍVEL 2: CATEGORIAS E RESPOSTAS FINAIS
  // =========================================================================

  const categoriaCobrancas = await prisma.step.create({
    data: {
      title: 'Cobrancas e Descontos',
      message: '*Cobranças, Descontos e Dívidas*\n\nSelecione o problema específico para ver as orientações:',
    },
  });

  const categoriaContratos = await prisma.step.create({
    data: {
      title: 'Contratos e Cancelamentos',
      message: '*Contratos e Cancelamentos*\n\nSelecione a situação que você está enfrentando:',
    },
  });

  const categoriaCompras = await prisma.step.create({
    data: {
      title: 'Compras e Entregas',
      message: '*Compras e Entregas*\n\nQual é a sua dúvida sobre o produto ou a compra?',
    },
  });

  const categoriaGarantiaPratica = await prisma.step.create({
    data: {
      title: 'Garantia Pratica',
      message: '*Garantia — já comprei e quebrou*\n\nSelecione o que está acontecendo no seu caso:',
    },
  });

  const categoriaGarantiaConceitos = await prisma.step.create({
    data: {
      title: 'Garantia Conceitos',
      message: '*Entendendo a Garantia*\n\nSelecione o tema para aprender sobre prazos e regras:',
    },
  });

  const categoriaCumprimentoOferta = await prisma.step.create({
    data: {
      title: 'Cumprimento de Oferta',
      message: '*Preço Anunciado e Cumprimento de Oferta*\n\nSelecione a situação:',
    },
  });

  const categoriaArrependimento = await prisma.step.create({
    data: {
      title: 'Direito de Arrependimento',
      message: '*Direito de Arrependimento (7 dias)*\n\nSelecione sua dúvida específica:',
    },
  });

  // --- Respostas do Processo da Reclamação ---
  const q8Duplicidade = await prisma.step.create({
    data: {
      title: 'Questao 8 - Reclamacao Online x Presencial',
      message: 'Se você já possui uma reclamação aberta sobre o mesmo assunto no PROCON Online, não é possível abrir outra reclamação presencial em duplicidade. Se desejar complementar informações, utilize o protocolo existente.',
    },
  });

  const q26PrazoResposta = await prisma.step.create({
    data: {
      title: 'Questao 26 - Prazo Resposta Fornecedor',
      message: 'Após a abertura da CIP (reclamação), o fornecedor tem um prazo de até 10 dias corridos para apresentar sua resposta no sistema. Caso não haja retorno ou o problema não seja resolvido, será agendada uma audiência conciliatória.',
    },
  });

  const q27DocumentosGerais = await prisma.step.create({
    data: {
      title: 'Questao 27 - Documentos Reclamacao',
      message: 'Cada caso exige uma análise específica. No entanto, os documentos fundamentais para qualquer atendimento são:\n\n• Documento oficial com foto (RG e CPF);\n• CNPJ da matriz do fornecedor reclamado;\n• Comprovantes do problema (faturas, contratos, extratos, prints e protocolos).\n\nCaso precise da lista detalhada por tipo de problema, utilize o botão *Documentos Necessários* do Menu Principal.',
    },
  });

  // =========================================================================
  // MAPAS DE OPÇÕES DO MENU PRINCIPAL
  // =========================================================================

  // 1. Menu Principal (3 Botões Clicáveis)
  await prisma.option.createMany({
    data: [
      { text: 'Entender um direito', stepId: menuPrincipal.id, nextStepId: submenuConceitos.id },
      { text: 'Docs. Necessários', stepId: menuPrincipal.id, nextStepId: null }, // Trata via lista no webhook
      { text: 'Processos & Queixas', stepId: menuPrincipal.id, nextStepId: categoriaProcesso.id },
    ],
  });

  // 2. Submenu Entender Direitos
  await prisma.option.createMany({
    data: [
      { text: 'Cobranças e Descontos', stepId: submenuConceitos.id, nextStepId: categoriaCobrancas.id },
      { text: 'Contratos/Cancelamento', stepId: submenuConceitos.id, nextStepId: categoriaContratos.id },
      { text: 'Compras e Entregas', stepId: submenuConceitos.id, nextStepId: categoriaCompras.id },
      { text: 'Garantia e Prazos', stepId: submenuConceitos.id, nextStepId: categoriaGarantiaConceitos.id },
      { text: 'Garantia (na prática)', stepId: submenuConceitos.id, nextStepId: categoriaGarantiaPratica.id },
      { text: 'Preço Anunciado', stepId: submenuConceitos.id, nextStepId: categoriaCumprimentoOferta.id },
      { text: 'Arrependimento 7 dias', stepId: submenuConceitos.id, nextStepId: categoriaArrependimento.id },
      { text: 'Voltar ao Início', stepId: submenuConceitos.id, nextStepId: menuPrincipal.id },
    ],
  });

  // 3. Processo e Reclamação
  await prisma.option.createMany({
    data: [
      { text: 'Já abri reclamação', stepId: categoriaProcesso.id, nextStepId: q8Duplicidade.id },
      { text: 'Prazo de resposta', stepId: categoriaProcesso.id, nextStepId: q26PrazoResposta.id },
      { text: 'Documentos gerais', stepId: categoriaProcesso.id, nextStepId: q27DocumentosGerais.id },
      { text: 'Voltar ao Início', stepId: categoriaProcesso.id, nextStepId: menuPrincipal.id },
    ],
  });

  console.log('✅ Seed refatorado com 3 botões principais e suporte à Lista de Documentos!');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });