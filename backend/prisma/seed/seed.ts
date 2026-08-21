import { prisma } from '../../src/database/index.js';

async function main() {
  console.log('Iniciando o seed do banco de dados...');

  // Limpa o banco de dados para evitar duplicidade
  await prisma.userSession.deleteMany({});
  await prisma.option.deleteMany({});
  await prisma.step.deleteMany({});

  // =========================================================================
  // NÍVEL 1: MENU PRINCIPAL (2 BOTÕES CLICÁVEIS)
  // =========================================================================
  const menuPrincipal = await prisma.step.create({
    data: {
      title: 'Menu Principal',
      message: 'Olá! Sou o assistente virtual do PROCON.\n\nComo posso ajudar você hoje? Por favor, escolha uma das opções abaixo:',
      isStart: true,
    },
  });

  const stepAgendamento = await prisma.step.create({
    data: {
      title: 'Fluxo Agendamento',
      message: '*Agendamento de Consulta Presencial*\n\nEsta funcionalidade está sendo preparada para a próxima Sprint! Em breve você poderá marcar seu atendimento por aqui.',
    },
  });

  // =========================================================================
  // NÍVEL 1.5: SUBMENU DE DÚVIDAS (3 BOTÕES CLICÁVEIS)
  // =========================================================================
  const menuDuvidasSub = await prisma.step.create({
    data: {
      title: 'Submenu Categoria Duvidas',
      message: '*O que aconteceu com você?*\n\nSelecione a opção que melhor descreve o seu problema:',
    },
  });

  // =========================================================================
  // NÍVEL 2: CATEGORIAS (PASSOS INTERMEDIÁRIOS - SE TRANFORMARÃO EM LISTAS)
  // =========================================================================
  const stepFinancas = await prisma.step.create({
    data: {
      title: 'Menu Serviços Financeiros',
      message: '*Bancos, Cobranças e Empréstimos*\n\nSelecione o problema específico para ver as orientações:',
    },
  });

  const stepCompras = await prisma.step.create({
    data: {
      title: 'Menu Compras e Entregas',
      message: '*Produtos, Entregas e Defeitos*\n\nQual é a sua dúvida sobre o produto ou compra?',
    },
  });

  const stepContratos = await prisma.step.create({
    data: {
      title: 'Menu Contratos e Planos',
      message: '*Serviços, Assinaturas e Contratos*\n\nSelecione a situação que você está enfrentando:',
    },
  });

  const stepGarantiasMenu = await prisma.step.create({
    data: {
      title: 'Menu Geral de Garantias',
      message: '*Garantias & Defeitos*\n\nVocê quer entender como a garantia funciona ou já está com um problema prático?',
    },
  });

  const stepGarantiasPrazos = await prisma.step.create({
    data: {
      title: 'Submenu Garantias Prazos',
      message: '*Entendendo a Garantia*\n\nSelecione o tema para aprender sobre prazos e regras:',
    },
  });

  const stepGarantiasProblemas = await prisma.step.create({
    data: {
      title: 'Submenu Garantias Problemas',
      message: '*Problemas Práticos com Garantia*\n\nSelecione o que está acontecendo no seu caso:',
    },
  });

  const stepGerais = await prisma.step.create({
    data: {
      title: 'Menu Duvidas Gerais',
      message: '*Atendimento e Reclamações*\n\nSelecione o assunto de seu interesse:',
    },
  });

  // =========================================================================
  // NÍVEL 3: RESPOSTAS FINAIS (COM MITIGAÇÃO DE RISCO E UX WHATSAPP-FIRST)
  // =========================================================================

  const q1SeguroCartao = await prisma.step.create({
    data: {
      title: 'Questao 1 - Seguro Cartao',
      message: '*Dependendo das circunstâncias, você pode ter o direito de solicitar o cancelamento e a restituição dos valores cobrados indevidamente (em alguns casos, em dobro).*\n\n*O que você pode fazer:*\n1. Peça o cancelamento imediato à empresa.\n2. Solicite a cópia do contrato para verificar a contratação.\n3. Caso recusem, abra reclamação no PROCON.\n\n*Tenha em mãos:*\n- RG e CPF.\n- Faturas detalhando os descontos.\n- Protocolos de atendimento.\n\n*Base Legal:* Art. 42, parágrafo único do CDC.\n\n*Importante:* Cada caso tem variações e será avaliado individualmente pelo PROCON.',
    },
  });

  const q2EmprestimoQuitado = await prisma.step.create({
    data: {
      title: 'Questao 2 - Emprestimo Quitado',
      message: '*Se houver cobrança indevida, você pode exigir a interrupção dos descontos e a devolução dos valores (podendo ser em dobro).* \n\n*O que você pode fazer:*\n1. Entre em contato com a empresa exigindo o fim dos descontos.\n2. Abra reclamação no PROCON apresentando as provas de quitação.\n\n*Tenha em mãos:*\n- RG e CPF.\n- Comprovantes de desconto (holerite/extrato).\n- Comprovantes de quitação do empréstimo.\n\n*Base Legal:* Art. 42 e Art. 14 do CDC.',
    },
  });

  const q3BeneficioNaoContratado = await prisma.step.create({
    data: {
      title: 'Questao 3 - Beneficio nao Contratado',
      message: '*Você pode registrar reclamação exigindo o cancelamento e o contrato. A devolução pode ocorrer em dobro caso não haja engano justificável.*\n\n*O que você pode fazer:*\n1. Não gaste o dinheiro depositado.\n2. Peça o cancelamento imediato e estorno.\n\n*Tenha em mãos:*\n- RG e CPF.\n- Extrato consignado do INSS.\n- Extrato bancário e histórico de crédito.\n\n*Importante:* Se você utilizou o dinheiro, o PROCON focará em solicitar uma proposta de quitação.',
    },
  });

  const q6RmcRcc = await prisma.step.create({
    data: {
      title: 'Questao 6 - RMC e RCC',
      message: '*É possível registrar reclamação pedindo a suspensão dos descontos. Se não houver engano justificável da empresa, os valores cobrados indevidamente podem ser restituídos em dobro.*\n\n*O que você pode fazer:*\n1. Identifique a cobrança no extrato.\n2. Busque o PROCON para contestar a contratação.\n\n*Tenha em mãos:*\n- Extrato consignado do INSS.\n- Extrato bancário e histórico de crédito.\n\n*Importante:* Se o crédito foi utilizado por você, o foco será negociar a quitação do saldo.',
    },
  });

  const q9MultaContrato = await prisma.step.create({
    data: {
      title: 'Questao 9 - Multa Contrato',
      message: '*Sim, é possível cancelar sem pagar multa, mas apenas em casos específicos.*\n\n*Quando a multa NÃO costuma ser cobrada:*\n- No direito de arrependimento (até 7 dias para compras fora da loja).\n- Por descumprimento de cláusulas pela própria empresa (falha grave no serviço).\n\n*Importante:* Em outros cenários (como quebra de fidelidade), a empresa pode cobrar multa. No entanto, ela não pode ser desproporcional ou abusiva. O PROCON pode avaliar o seu contrato individualmente.',
    },
  });

  const q31GarantiaContratual = await prisma.step.create({
    data: {
      title: 'Questao 31 - Garantia Contratual',
      message: '*É a garantia oferecida pelo fabricante complementar à garantia legal.*\n\n*Como funciona:*\n- Ela deve vir descrita detalhadamente em um termo escrito entregue a você.\n- A forma como o prazo contratual se soma ao prazo legal (se começam juntos ou um após o término do outro) depende estritamente do que foi estabelecido no documento da garantia.\n\n*Base Legal:* Art. 50 do CDC.',
    },
  });

  const q44DefeitoCarroUsado = await prisma.step.create({
    data: {
      title: 'Questao 44 - Carro Usado',
      message: '*O fato de o veículo ser seminovo não elimina, por si só, a garantia legal.*\n\n*O que você pode fazer:*\nSe houver um vício oculto (que não foi informado na compra) e ele não for solucionado no prazo legal, o CDC prevê medidas que podem incluir o conserto, troca ou abatimento proporcional do preço.\n\n*Base Legal:* Art. 18 do CDC.\n\n*Importante:* A viabilidade do pedido (como cancelamento da compra) depende da natureza do vício, de quando ele foi descoberto e se a loja avisou sobre a limitação antes da venda.',
    },
  });

  const q4RecusaContrato = await prisma.step.create({
    data: {
      title: 'Questao 4 - Recusa Contrato',
      message: 'A empresa é obrigada a fornecer o documento. O CDC garante o direito à informação clara e determina que o consumidor deve ter acesso prévio ao conteúdo do contrato. O consumidor tem direito de abrir uma reclamação no Procon requerendo a documentação.\n\n*Tenha em mãos:*\n- RG e CPF\n- Números de protocolo\n- Mensagens exigindo o contrato.',
    },
  });

  const q5CancelamentoTelefone = await prisma.step.create({
    data: {
      title: 'Questao 5 - Cancelamento Telefone',
      message: 'Se a empresa está criando obstáculos, você tem o direito de abrir uma reclamação requerendo o cancelamento imediato do serviço e a suspensão das cobranças.\n\n*Tenha em mãos:*\n- RG com CPF\n- Contrato\n- Comprovantes de pagamentos\n- Número de protocolo requerendo o cancelamento\n\n*Atenção:* A empresa pode cobrar multa por quebra de fidelidade, sendo necessária avaliação do caso.',
    },
  });

  const q7PlataformaOnline = await prisma.step.create({
    data: {
      title: 'Questao 7 - Plataforma Online',
      message: 'Sim, você deve entrar em contato tanto com a loja vendedora quanto com a plataforma (Marketplace). O CDC impõe responsabilidade objetiva ao fornecedor, que inclui a loja e, em muitos casos, a plataforma que intermedia a venda, especialmente se ela facilita ou garante a transação.',
    },
  });

  const q8Duplicidade = await prisma.step.create({
    data: {
      title: 'Questao 8 - Reclamacao Online x Presencial',
      message: 'Se você já possui uma reclamação aberta sobre o mesmo assunto, não é possível abrir outra reclamação em duplicidade. Se quiser complementar informações, utilize o protocolo existente.',
    },
  });

  const q10Fidelidade = await prisma.step.create({
    data: {
      title: 'Questao 10 - Fidelidade',
      message: 'Sim, um contrato pode ter cláusula de fidelidade, sendo comum em telecomunicações. Ela obriga o consumidor a manter o serviço por um tempo mínimo (máximo de 12 meses na telefonia). A multa por cancelamento antecipado deve ser proporcional ao tempo restante, sendo ilegal se a rescisão for por falha da operadora.',
    },
  });

  const q11ArrependimentoSeteDias = await prisma.step.create({
    data: {
      title: 'Questao 11 - Arrependimento',
      message: 'O consumidor pode desistir do contrato no prazo de 7 dias a contar da assinatura ou do recebimento do produto, sempre que a compra ocorrer FORA da loja física (internet ou telefone). Os valores eventualmente pagos serão devolvidos.',
    },
  });

  const q15PrazoEntrega = await prisma.step.create({
    data: {
      title: 'Questao 15 - Prazo Entrega',
      message: 'Se a loja não entregou o produto no prazo prometido, você pode escolher entre:\n1) Exigir a entrega imediata;\n2) Aceitar outro produto equivalente;\n3) Cancelar a compra com direito à devolução do dinheiro corrigido.',
    },
  });

  const q24Portabilidade = await prisma.step.create({
    data: {
      title: 'Questao 24 - Portabilidade Beneficio',
      message: 'Sim, a portabilidade deve ser solicitada apenas pelo titular da conta. Porém, caso exista algum tipo de empréstimo pessoal ou dívida com o banco atrelada, a portabilidade pode enfrentar restrições previstas em contrato.',
    },
  });

  const q25PrescricaoDivida = await prisma.step.create({
    data: {
      title: 'Questao 25 - Prescricao Divida',
      message: 'A dívida NÃO deixa de existir automaticamente depois de cinco anos. O que acontece é a prescrição: a empresa não pode mais cobrar judicialmente e seu nome não pode ficar negativado (no SPC/Serasa) por esse débito. No entanto, a empresa ainda pode disponibilizar a oportunidade de quitar as pendências amigavelmente.',
    },
  });

  const q26PrazoResposta = await prisma.step.create({
    data: {
      title: 'Questao 26 - Prazo Resposta Fornecedor',
      message: 'Após a abertura oficial da reclamação, o fornecedor costuma ter um prazo de até 10 dias corridos para apresentar resposta no sistema. Caso não haja retorno ou o problema não seja resolvido, pode ser agendada uma audiência conciliatória.',
    },
  });

  const q27DocumentosGerais = await prisma.step.create({
    data: {
      title: 'Questao 27 - Documentos Reclamacao',
      message: 'Cada caso exige uma análise, mas tenha sempre em mãos:\n- Documento pessoal (RG/CPF)\n- CNPJ da matriz da empresa\n- Comprovantes do problema (notas, protocolos, prints, faturas).\n\nPara análise detalhada, compareça presencialmente ao PROCON.',
    },
  });

  const q28TiposGarantia = await prisma.step.create({
    data: {
      title: 'Questao 28 - Tipos Garantia',
      message: 'Existem três tipos principais de garantia:\n1. Garantia Legal (Direito do consumidor)\n2. Garantia Contratual (Dada pelo fabricante)\n3. Garantia Estendida (Contratada à parte como seguro).',
    },
  });

  const q29GarantiaLegal = await prisma.step.create({
    data: {
      title: 'Questao 29 - Garantia Legal',
      message: 'A garantia legal é prevista no Código de Defesa do Consumidor e independe de contrato. Os prazos são:\n- 30 dias para produtos ou serviços não duráveis (ex: alimentos).\n- 90 dias para produtos ou serviços duráveis (ex: eletrodomésticos, eletrônicos).',
    },
  });

  const q32GarantiaEstendida = await prisma.step.create({
    data: {
      title: 'Questao 32 - Garantia Estendida',
      message: 'É um serviço adicional (pago) que prolonga a garantia após o término da de fábrica. Ela funciona como um seguro e deve ter contrato detalhando a cobertura. Nenhuma loja pode te obrigar a contratar isso para levar o produto (venda casada).',
    },
  });

  const q33NegarGarantia = await prisma.step.create({
    data: {
      title: 'Questao 33 - Negar Garantia',
      message: 'A empresa pode negar a garantia caso comprove mau uso, quedas ou alteração por terceiros não autorizados. No entanto, é a empresa que tem a obrigação de comprovar esse mau uso através de laudo técnico.',
    },
  });

  const q34NaoResolvido30Dias = await prisma.step.create({
    data: {
      title: 'Questao 34 - Nao Resolvido 30 Dias',
      message: 'Se o defeito não foi solucionado pela assistência em até 30 dias, você ganha o direito de escolher entre:\n1. A troca do produto por outro novo;\n2. A devolução do valor pago;\n3. O abatimento proporcional do preço.',
    },
  });

  const q35NotaFiscalGarantia = await prisma.step.create({
    data: {
      title: 'Questao 35 - Nota Fiscal',
      message: 'A nota fiscal facilita muito o processo, mas se você perdeu, pode utilizar outros meios para comprovar a compra, como extrato do cartão de crédito, comprovante de pix ou confirmação do pedido.',
    },
  });

  const q36ProdutosUsados = await prisma.step.create({
    data: {
      title: 'Questao 36 - Produtos Usados',
      message: 'Sim. Produtos usados também possuem garantia legal de 90 dias (se duráveis), a menos que a loja tenha especificado e informado claramente os defeitos existentes antes de você fechar a compra.',
    },
  });

  const q47DireitoImobiliario = await prisma.step.create({
    data: {
      title: 'Questao 47 - Direito Imobiliario',
      message: 'Questões relacionadas a aluguel são tratadas principalmente pela Lei do Inquilinato (Lei nº 8.245/91). Por ser uma legislação específica que foge à relação de consumo tradicional, o PROCON não realiza a intervenção desse tipo de demanda imobiliária.',
    },
  });

  // =========================================================================
  // MAPAS DE ACESSO E CONEXÕES (NOMENCLATURAS COM MÁXIMO 20 CARACTERES)
  // =========================================================================

  // 1. Menu Principal (2 Botões Clicáveis)
  await prisma.option.createMany({
    data: [
      { text: 'Quero tirar dúvida', stepId: menuPrincipal.id, nextStepId: menuDuvidasSub.id },
      { text: 'Agendar Consulta', stepId: menuPrincipal.id, nextStepId: stepAgendamento.id },
    ],
  });

  // 2. Submenu de Dúvidas (3 Botões Clicáveis)
  await prisma.option.createMany({
    data: [
      { text: 'Comprei um produto', stepId: menuDuvidasSub.id, nextStepId: stepCompras.id }, 
      { text: 'Problema c/ serviço', stepId: menuDuvidasSub.id, nextStepId: stepContratos.id }, 
      { text: 'Como reclamar', stepId: menuDuvidasSub.id, nextStepId: stepGerais.id }, 
    ],
  });

  // 3. Modificamos os menus intermediários para conectarem suas listas de opções:
  
  // Pilar Produtos (Lista)
  await prisma.option.createMany({
    data: [
      { text: 'Produto não chegou', stepId: stepCompras.id, nextStepId: q15PrazoEntrega.id },
      { text: 'Compra na Internet', stepId: stepCompras.id, nextStepId: q7PlataformaOnline.id },
      { text: 'Produto quebrou', stepId: stepCompras.id, nextStepId: stepGarantiasMenu.id },
      { text: 'Voltar ao Início', stepId: stepCompras.id, nextStepId: menuPrincipal.id },
    ],
  });

  // Pilar Serviços (Lista)
  await prisma.option.createMany({
    data: [
      { text: 'Cobrança/Banco', stepId: stepContratos.id, nextStepId: stepFinancas.id },
      { text: 'Cadê meu contrato?', stepId: stepContratos.id, nextStepId: q4RecusaContrato.id },
      { text: 'Cancelar serviço', stepId: stepContratos.id, nextStepId: q5CancelamentoTelefone.id },
      { text: 'Cobrança de Multa', stepId: stepContratos.id, nextStepId: q9MultaContrato.id },
      { text: 'Tem fidelidade?', stepId: stepContratos.id, nextStepId: q10Fidelidade.id },
      { text: 'Desistir da compra', stepId: stepContratos.id, nextStepId: q11ArrependimentoSeteDias.id },
      { text: 'Voltar ao Início', stepId: stepContratos.id, nextStepId: menuPrincipal.id },
    ],
  });

  // Conexões de Finanças (Lista interna de Serviços)
  await prisma.option.createMany({
    data: [
      { text: 'Seguro não pedido', stepId: stepFinancas.id, nextStepId: q1SeguroCartao.id },
      { text: 'Empréstimo folha', stepId: stepFinancas.id, nextStepId: q2EmprestimoQuitado.id },
      { text: 'Empréstimo no INSS', stepId: stepFinancas.id, nextStepId: q3BeneficioNaoContratado.id },
      { text: 'Desconto no INSS', stepId: stepFinancas.id, nextStepId: q6RmcRcc.id },
      { text: 'Dívida de 5 anos', stepId: stepFinancas.id, nextStepId: q25PrescricaoDivida.id },
      { text: 'Voltar', stepId: stepFinancas.id, nextStepId: stepContratos.id },
    ],
  });

  // Conexões de Garantias (3 Botões Clicáveis)
  await prisma.option.createMany({
    data: [
      { text: 'Entender garantia', stepId: stepGarantiasMenu.id, nextStepId: stepGarantiasPrazos.id },
      { text: 'Problema na prática', stepId: stepGarantiasMenu.id, nextStepId: stepGarantiasProblemas.id },
      { text: 'Voltar', stepId: stepGarantiasMenu.id, nextStepId: stepCompras.id },
    ],
  });

  // Opções do Submenu: Prazos e Tipos de Garantia (Lista)
  await prisma.option.createMany({
    data: [
      { text: 'Tipos de Garantia', stepId: stepGarantiasPrazos.id, nextStepId: q28TiposGarantia.id },
      { text: 'Garantia Legal', stepId: stepGarantiasPrazos.id, nextStepId: q29GarantiaLegal.id },
      { text: 'Garantia Contratual', stepId: stepGarantiasPrazos.id, nextStepId: q31GarantiaContratual.id },
      { text: 'Garantia Estendida', stepId: stepGarantiasPrazos.id, nextStepId: q32GarantiaEstendida.id },
      { text: 'Produtos Usados', stepId: stepGarantiasPrazos.id, nextStepId: q36ProdutosUsados.id },
      { text: 'Voltar', stepId: stepGarantiasPrazos.id, nextStepId: stepGarantiasMenu.id },
    ],
  });

  // Opções do Submenu: Problemas Práticos de Garantia (Lista)
  await prisma.option.createMany({
    data: [
      { text: 'Empresa não ajuda', stepId: stepGarantiasProblemas.id, nextStepId: q33NegarGarantia.id },
      { text: 'Passou de 30 dias', stepId: stepGarantiasProblemas.id, nextStepId: q34NaoResolvido30Dias.id },
      { text: 'Sem nota fiscal', stepId: stepGarantiasProblemas.id, nextStepId: q35NotaFiscalGarantia.id },
      { text: 'Carro usado quebrou', stepId: stepGarantiasProblemas.id, nextStepId: q44DefeitoCarroUsado.id },
      { text: 'Voltar', stepId: stepGarantiasProblemas.id, nextStepId: stepGarantiasMenu.id },
    ],
  });

  // Opções do Submenu: Informações Úteis (Lista)
  await prisma.option.createMany({
    data: [
      { text: 'Já abri reclamação', stepId: stepGerais.id, nextStepId: q8Duplicidade.id },
      { text: 'Mudar banco INSS', stepId: stepGerais.id, nextStepId: q24Portabilidade.id },
      { text: 'Prazo de resposta', stepId: stepGerais.id, nextStepId: q26PrazoResposta.id },
      { text: 'Quais documentos?', stepId: stepGerais.id, nextStepId: q27DocumentosGerais.id },
      { text: 'Aluguel/Imóvel', stepId: stepGerais.id, nextStepId: q47DireitoImobiliario.id },
      { text: 'Voltar ao Início', stepId: stepGerais.id, nextStepId: menuPrincipal.id },
    ],
  });

  console.log('Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });