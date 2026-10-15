import { prisma } from '../../src/database/index.js';

async function main() {
  console.log('Iniciando o seed do banco de dados...');

  // Limpa o banco de dados para evitar duplicidade
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

✍️ *Contando o seu problema:* A qualquer momento, você pode digitar o que aconteceu. 

💡 *Dica:* Ao digitar, explique a situação com detalhes (o que você comprou/contratou, quando foi e o que deu errado). Irei analisar seu caso e te orientar da melhor forma possível.

🔒 *Sua privacidade está garantida:* Seus dados não serão enviados nem compartilhados com terceiros, e serão utilizados exclusivamente para seu atendimento.

Como posso te ajudar hoje?`,
      isStart: true,
    },
  });

  // =========================================================================
  // NÍVEL 1.5: SUBMENUS E CATEGORIAS DE ROTEAMENTO
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

  // =========================================================================
  // NÍVEL 2: RESPOSTAS FINAIS (PERGUNTAS / CONTEÚDO)
  // =========================================================================

  // --- Categoria A: Cobranças, Descontos e Dívidas ---
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

  // --- Categoria B: Contratos e Cancelamentos ---
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

  const q9MultaContrato = await prisma.step.create({
    data: {
      title: 'Questao 9 - Multa Contrato',
      message: '*Sim, é possível cancelar sem pagar multa, mas apenas em casos específicos.*\n\n*Quando a multa NÃO costuma ser cobrada:*\n- No direito de arrependimento (até 7 dias para compras fora da loja).\n- Por descumprimento de cláusulas pela própria empresa (falha grave no serviço).\n\n*Importante:* Em outros cenários (como quebra de fidelidade), a empresa pode cobrar multa. No entanto, ela não pode ser desproporcional ou abusiva. O PROCON pode avaliar o seu contrato individualmente.',
    },
  });

  const q10Fidelidade = await prisma.step.create({
    data: {
      title: 'Questao 10 - Fidelidade',
      message: 'Sim, um contrato pode ter cláusula de fidelidade, sendo comum em telecomunicações. Ela obriga o consumidor a manter o serviço por um tempo mínimo (máximo de 12 meses na telefonia). A multa por cancelamento antecipado deve ser proporcional ao tempo restante, sendo ilegal se a rescisão for por falha da operadora.',
    },
  });

  const q46NotaFiscalNaoEnviada = await prisma.step.create({
    data: {
      title: 'Questao 46 - Nota Fiscal Nao Enviada',
      message: 'O recebimento da nota fiscal é um direito à informação, garantido pelo Art. 6º, III do CDC. Se a empresa prometeu enviar e não enviou, mesmo após você cobrar, o PROCON pode solicitar esclarecimento e o envio da documentação diretamente ao fornecedor.\n\n*Tenha em mãos:*\n- RG e CPF\n- Comprovante da compra\n- Mensagens cobrando o envio da nota',
    },
  });

  // --- Subcategoria: Direito de Arrependimento (7 dias) ---
  const q11ArrependimentoSeteDias = await prisma.step.create({
    data: {
      title: 'Questao 11 - Arrependimento',
      message: 'O consumidor pode desistir do contrato no prazo de 7 dias a contar da assinatura ou do recebimento do produto, sempre que a compra ocorrer FORA da loja física (internet ou telefone). Os valores eventualmente pagos serão devolvidos.\n\n*Base Legal:* Art. 49 do CDC.',
    },
  });

  const q12LojaFisica = await prisma.step.create({
    data: {
      title: 'Questao 12 - Vale Loja Fisica',
      message: 'Não. O direito de arrependimento (Art. 49 do CDC) só se aplica a compras feitas FORA do estabelecimento comercial (internet, telefone, catálogo, porta a porta). Em compra presencial, o consumidor pôde avaliar o produto antes de decidir, então esse direito específico não se aplica.',
    },
  });

  const q13FreteDevolucao = await prisma.step.create({
    data: {
      title: 'Questao 13 - Frete Devolucao',
      message: 'A empresa. O consumidor não deve arcar com nenhum custo de frete ou postagem para a devolução. A empresa deve reembolsar o valor total pago, incluindo o frete de envio.\n\n*Base Legal:* Art. 49 do CDC.',
    },
  });

  const q14EmbalagemAberta = await prisma.step.create({
    data: {
      title: 'Questao 14 - Embalagem Aberta',
      message: 'Sim, desde que com cautela. O consumidor tem o direito de testar o produto para saber se ele atende às expectativas, agindo como faria em uma loja física. A embalagem original é recomendada, mas não é obrigatória para a devolução, e o produto deve ser devolvido sem danos causados por mau uso.\n\n*Base Legal:* Art. 49 do CDC.',
    },
  });

  // --- Categoria C: Compras e Entregas ---
  const q7PlataformaOnline = await prisma.step.create({
    data: {
      title: 'Questao 7 - Plataforma Online',
      message: 'Sim, você deve entrar em contato tanto com a loja vendedora quanto com a plataforma (Marketplace). O CDC impõe responsabilidade objetiva ao fornecedor, que inclui a loja e, em muitos casos, a plataforma que intermedia a venda, especialmente se ela facilita ou garante a transação.',
    },
  });

  const q15PrazoEntrega = await prisma.step.create({
    data: {
      title: 'Questao 15 - Prazo Entrega',
      message: 'Se a loja não entregou o produto no prazo prometido, você pode escolher entre:\n1) Exigir a entrega imediata;\n2) Aceitar outro produto equivalente;\n3) Cancelar a compra com direito à devolução do dinheiro corrigido.',
    },
  });

  const q43TrocaPresencial = await prisma.step.create({
    data: {
      title: 'Questao 43 - Troca Presencial Sem Defeito',
      message: 'Não é obrigatório. O direito de arrependimento do CDC vale apenas para compras feitas fora do estabelecimento (online, telefone). Em compra presencial e sem defeito no produto, o consumidor já pôde avaliar o item antes de comprar, então não há obrigação legal de troca ou cancelamento por arrependimento — isso fica a critério de cada loja.\n\n*Exceção:* se o item foi comprado como presente, a troca também fica a critério da loja, mas é uma prática comum no mercado.',
    },
  });

  // --- Subcategoria: Cumprimento de Oferta (preço anunciado) ---
  const q38CumprimentoOferta = await prisma.step.create({
    data: {
      title: 'Questao 38 - Cumprimento Preco Anunciado',
      message: 'Sim. O que é anunciado obriga o fornecedor — a oferta faz parte do contrato.\n\n*Base Legal:* Art. 30 do CDC.',
    },
  });

  const q39PrecoDivergente = await prisma.step.create({
    data: {
      title: 'Questao 39 - Preco Divergente',
      message: 'Vale o menor preço. O consumidor tem direito à informação clara e correta. Se houver divergência entre a prateleira e o caixa, aplica-se o valor mais vantajoso ao consumidor.\n\n*Base Legal:* Art. 30 do CDC.',
    },
  });

  const q40LojaNaoQuerVender = await prisma.step.create({
    data: {
      title: 'Questao 40 - Loja Nao Quer Vender',
      message: 'Você pode escolher, à sua livre escolha, entre:\n1. Exigir o cumprimento forçado do preço anunciado;\n2. Aceitar outro produto ou serviço equivalente;\n3. Cancelar e receber o dinheiro de volta corrigido, com direito a perdas e danos.\n\n*Base Legal:* Art. 35 do CDC.',
    },
  });

  const q41ErroSistema = await prisma.step.create({
    data: {
      title: 'Questao 41 - Erro de Sistema',
      message: 'Em regra, não. O risco do negócio é do fornecedor — ele é responsável pelas informações que divulga (Art. 30 do CDC).\n\n*Exceção:* quando o preço é claramente irreal e desproporcional (erro grosseiro e evidente, facilmente perceptível), a jurisprudência pode afastar a obrigatoriedade de cumprimento.',
    },
  });

  const q42SemAvisoEstoque = await prisma.step.create({
    data: {
      title: 'Questao 42 - Sem Aviso Estoque',
      message: 'Não. A limitação de estoque deve ser informada de forma clara antes da compra. Sem esse aviso, a loja não pode simplesmente recusar a venda alegando que o produto acabou.\n\n*Base Legal:* Art. 39, inciso II do CDC.',
    },
  });

  // --- Categoria D: Garantia — Conceitos e Prazos ---
  const q28TiposGarantia = await prisma.step.create({
    data: {
      title: 'Questao 28 - Tipos Garantia',
      message: 'Existem três tipos principais de garantia:\n1. Garantia Legal (Direito do consumidor)\n2. Garantia Contratual (Dada pelo fabricante)\n3. Garantia Estendida (Contratada à parte como seguro).',
    },
  });

  const q29GarantiaLegal = await prisma.step.create({
    data: {
      title: 'Questao 29 - Garantia Legal',
      message: 'A garantia legal é prevista no Código de Defesa do Consumidor e independe de contrato. Os prazos são:\n- 30 dias para produtos ou serviços não duráveis (ex: alimentos).\n- 90 dias para produtos ou serviços duráveis (ex: eletrodomésticos, eletrônicos).\n\n*Base Legal:* Art. 26 do CDC.',
    },
  });

  const q30InicioContagemGarantia = await prisma.step.create({
    data: {
      title: 'Questao 30 - Inicio Contagem Garantia',
      message: 'A contagem inicia a partir da entrega efetiva do produto ou da conclusão do serviço. No caso de vício oculto (aquele que não é visível de imediato), o prazo começa a contar a partir do momento em que o problema é identificado, não da data da compra.\n\n*Base Legal:* Art. 26, §1º e §3º do CDC.',
    },
  });

  const q31GarantiaContratual = await prisma.step.create({
    data: {
      title: 'Questao 31 - Garantia Contratual',
      message: '*É a garantia oferecida pelo fabricante complementar à garantia legal.*\n\n*Como funciona:*\n- Ela deve vir descrita detalhadamente em um termo escrito entregue a você.\n- A forma como o prazo contratual se soma ao prazo legal (se começam juntos ou um após o término do outro) depende estritamente do que foi estabelecido no documento da garantia.\n\n*Base Legal:* Art. 50 do CDC.',
    },
  });

  const q32GarantiaEstendida = await prisma.step.create({
    data: {
      title: 'Questao 32 - Garantia Estendida',
      message: 'É um serviço adicional (pago) que prolonga a garantia após o término da de fábrica. Ela funciona como um seguro e deve ter contrato detalhando a cobertura. Nenhuma loja pode te obrigar a contratar isso para levar o produto (venda casada).',
    },
  });

  const q37ServicosGarantia = await prisma.step.create({
    data: {
      title: 'Questao 37 - Servicos Tem Garantia',
      message: 'Sim. Serviços também possuem garantia legal:\n- 30 dias para serviços não duráveis.\n- 90 dias para serviços duráveis.\n\n*Base Legal:* Art. 26 do CDC.',
    },
  });

  const q16ViceApareenteOcultoDefeito = await prisma.step.create({
    data: {
      title: 'Questao 16 - Vicio Aparente Oculto Defeito',
      message: '*Vício aparente:* falha fácil de perceber no momento da compra ou uso inicial (ex: um risco na tela da TV, um sapato descolado).\n\n*Vício oculto:* defeito que não aparece de imediato e surge com o uso (ex: um motor de carro que quebra com pouco tempo de uso).\n\n*Vício x Fato (Defeito):* vício é quando o problema se limita ao próprio produto/serviço (ex: TV não liga). Fato (ou defeito) é quando o problema coloca em risco a saúde ou a segurança do consumidor, causando dano externo (ex: celular explode).',
    },
  });

  const q18PrazoVicioOculto = await prisma.step.create({
    data: {
      title: 'Questao 18 - Prazo Vicio Oculto',
      message: 'O prazo para reclamar de um vício oculto começa a contar a partir do momento em que o defeito é descoberto, e não da data da compra.',
    },
  });

  const q21GarantiaProdutoTroca = await prisma.step.create({
    data: {
      title: 'Questao 21 - Garantia Produto Trocado',
      message: 'Se for um bem não durável, a garantia do produto novo é de 30 dias; se for durável, 90 dias. Porém, o prazo não deve ser inferior ao que restava no produto original. Exemplo: se o produto foi trocado com 9 meses restantes de garantia contratual, o produto novo terá essa mesma garantia restante de 9 meses.',
    },
  });

  const q22SubstituicaoIndisponivel = await prisma.step.create({
    data: {
      title: 'Questao 22 - Substituicao Indisponivel',
      message: 'Sim. Se você optou pela substituição do produto com vício e não há mais disponibilidade do mesmo modelo, pode haver substituição por outro de espécie, marca ou modelo diferente, mediante complementação ou restituição de eventual diferença de preço.\n\n*Base Legal:* Art. 18, §1º e §4º do CDC.',
    },
  });

  // --- Categoria E: Garantia — Problemas Práticos ---
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
  // MAPAS DE OPÇÕES E CONEXÕES (OPÇÕES DO MENU)
  // =========================================================================

  // 1. Menu Principal (3 Botões Clicáveis)
  await prisma.option.createMany({
    data: [
      { text: 'Entender um direito', stepId: menuPrincipal.id, nextStepId: submenuConceitos.id },
      { text: 'Docs. Necessários', stepId: menuPrincipal.id, nextStepId: null }, // Trata via lista no webhook
      { text: 'Processos & Queixas', stepId: menuPrincipal.id, nextStepId: categoriaProcesso.id },
    ],
  });

  // 2. Submenu Entender Direitos (Lista)
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

  // 4. Categoria A: Cobranças e Descontos
  await prisma.option.createMany({
    data: [
      { text: 'Seguro não pedido', stepId: categoriaCobrancas.id, nextStepId: q1SeguroCartao.id },
      { text: 'Empréstimo folha', stepId: categoriaCobrancas.id, nextStepId: q2EmprestimoQuitado.id },
      { text: 'Empréstimo no INSS', stepId: categoriaCobrancas.id, nextStepId: q3BeneficioNaoContratado.id },
      { text: 'Desconto RMC/RCC', stepId: categoriaCobrancas.id, nextStepId: q6RmcRcc.id },
      { text: 'Portabilidade', stepId: categoriaCobrancas.id, nextStepId: q24Portabilidade.id },
      { text: 'Dívida de 5 anos', stepId: categoriaCobrancas.id, nextStepId: q25PrescricaoDivida.id },
      { text: 'Voltar', stepId: categoriaCobrancas.id, nextStepId: submenuConceitos.id },
    ],
  });

  // 5. Categoria B: Contratos e Cancelamentos
  await prisma.option.createMany({
    data: [
      { text: 'Cadê meu contrato?', stepId: categoriaContratos.id, nextStepId: q4RecusaContrato.id },
      { text: 'Cancelar serviço', stepId: categoriaContratos.id, nextStepId: q5CancelamentoTelefone.id },
      { text: 'Cobrança de multa', stepId: categoriaContratos.id, nextStepId: q9MultaContrato.id },
      { text: 'Tem fidelidade?', stepId: categoriaContratos.id, nextStepId: q10Fidelidade.id },
      { text: 'Nota fiscal não veio', stepId: categoriaContratos.id, nextStepId: q46NotaFiscalNaoEnviada.id },
      { text: 'Desisti da compra', stepId: categoriaContratos.id, nextStepId: categoriaArrependimento.id },
      { text: 'Voltar', stepId: categoriaContratos.id, nextStepId: submenuConceitos.id },
    ],
  });

  // 5.1 Subcategoria: Direito de Arrependimento
  await prisma.option.createMany({
    data: [
      { text: 'Como funciona (7 dias)', stepId: categoriaArrependimento.id, nextStepId: q11ArrependimentoSeteDias.id },
      { text: 'Vale p/ loja física?', stepId: categoriaArrependimento.id, nextStepId: q12LojaFisica.id },
      { text: 'Quem paga o frete?', stepId: categoriaArrependimento.id, nextStepId: q13FreteDevolucao.id },
      { text: 'Já usei, posso devolver?', stepId: categoriaArrependimento.id, nextStepId: q14EmbalagemAberta.id },
      { text: 'Voltar ao Início', stepId: categoriaArrependimento.id, nextStepId: menuPrincipal.id },
    ],
  });

  // 6. Categoria C: Compras e Entregas
  await prisma.option.createMany({
    data: [
      { text: 'Compra na Internet', stepId: categoriaCompras.id, nextStepId: q7PlataformaOnline.id },
      { text: 'Produto não chegou', stepId: categoriaCompras.id, nextStepId: q15PrazoEntrega.id },
      { text: 'Troca sem defeito', stepId: categoriaCompras.id, nextStepId: q43TrocaPresencial.id },
      { text: 'Voltar', stepId: categoriaCompras.id, nextStepId: submenuConceitos.id },
    ],
  });

  // 6.1 Subcategoria: Cumprimento de Oferta
  await prisma.option.createMany({
    data: [
      { text: 'Tem que cumprir preço?', stepId: categoriaCumprimentoOferta.id, nextStepId: q38CumprimentoOferta.id },
      { text: 'Preço na prateleira', stepId: categoriaCumprimentoOferta.id, nextStepId: q39PrecoDivergente.id },
      { text: 'Loja não quer vender', stepId: categoriaCumprimentoOferta.id, nextStepId: q40LojaNaoQuerVender.id },
      { text: '"Foi erro do sistema"', stepId: categoriaCumprimentoOferta.id, nextStepId: q41ErroSistema.id },
      { text: 'Disseram q acabou', stepId: categoriaCumprimentoOferta.id, nextStepId: q42SemAvisoEstoque.id },
      { text: 'Voltar', stepId: categoriaCumprimentoOferta.id, nextStepId: submenuConceitos.id },
    ],
  });

  // 7. Categoria D: Garantia Conceitos
  await prisma.option.createMany({
    data: [
      { text: 'Tipos de Garantia', stepId: categoriaGarantiaConceitos.id, nextStepId: q28TiposGarantia.id },
      { text: 'Garantia Legal', stepId: categoriaGarantiaConceitos.id, nextStepId: q29GarantiaLegal.id },
      { text: 'Quando começa a contar', stepId: categoriaGarantiaConceitos.id, nextStepId: q30InicioContagemGarantia.id },
      { text: 'Garantia Contratual', stepId: categoriaGarantiaConceitos.id, nextStepId: q31GarantiaContratual.id },
      { text: 'Garantia Estendida', stepId: categoriaGarantiaConceitos.id, nextStepId: q32GarantiaEstendida.id },
      { text: 'Serviço tem garantia?', stepId: categoriaGarantiaConceitos.id, nextStepId: q37ServicosGarantia.id },
      { text: 'Vício x Defeito', stepId: categoriaGarantiaConceitos.id, nextStepId: q16ViceApareenteOcultoDefeito.id },
      { text: 'Prazo do vício oculto', stepId: categoriaGarantiaConceitos.id, nextStepId: q18PrazoVicioOculto.id },
      { text: 'Garantia produto trocado', stepId: categoriaGarantiaConceitos.id, nextStepId: q21GarantiaProdutoTroca.id },
      { text: 'Produto indisponível', stepId: categoriaGarantiaConceitos.id, nextStepId: q22SubstituicaoIndisponivel.id },
    ],
  });

  // 8. Categoria E: Garantia Prática
  await prisma.option.createMany({
    data: [
      { text: 'Empresa não ajuda', stepId: categoriaGarantiaPratica.id, nextStepId: q33NegarGarantia.id },
      { text: 'Passou de 30 dias', stepId: categoriaGarantiaPratica.id, nextStepId: q34NaoResolvido30Dias.id },
      { text: 'Sem nota fiscal', stepId: categoriaGarantiaPratica.id, nextStepId: q35NotaFiscalGarantia.id },
      { text: 'Produto usado', stepId: categoriaGarantiaPratica.id, nextStepId: q36ProdutosUsados.id },
      { text: 'Voltar', stepId: categoriaGarantiaPratica.id, nextStepId: submenuConceitos.id },
    ],
  });

  console.log('✅ Seed executado com sucesso! Arquitetura de 3 botões sincronizada com todas as respostas e opções do menu.');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });