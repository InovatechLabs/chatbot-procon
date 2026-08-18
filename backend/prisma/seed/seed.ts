import { prisma } from '../../src/database/index.js';

async function main() {
  console.log('🌱 Iniciando o seed do banco de dados...');

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

  // Rota de Agendamento (Mock/Vazia por enquanto)
  const stepAgendamento = await prisma.step.create({
    data: {
      title: 'Fluxo Agendamento',
      message: '🗓️ *Agendamento de Consulta Presencial*\n\nEsta funcionalidade está sendo preparada para a próxima Sprint! Em breve você poderá marcar seu atendimento por aqui.',
    },
  });

  // =========================================================================
  // NÍVEL 1.5: SUBMENU DE DÚVIDAS (3 BOTÕES CLICÁVEIS)
  // =========================================================================
  const menuDuvidasSub = await prisma.step.create({
    data: {
      title: 'Submenu Categoria Duvidas',
      message: '💡 *Dúvidas Gerais*\n\nSelecione o pilar principal sobre o qual deseja obter orientações:',
    },
  });

  // =========================================================================
  // NÍVEL 2: CATEGORIAS (PASSOS INTERMEDIÁRIOS - SE TRANFORMARÃO EM LISTAS)
  // =========================================================================
  const stepFinancas = await prisma.step.create({
    data: {
      title: 'Menu Serviços Financeiros',
      message: '💳 *Serviços Financeiros & Cobranças*\n\nSelecione o problema específico para ver as orientações originais do PROCON:',
    },
  });

  const stepCompras = await prisma.step.create({
    data: {
      title: 'Menu Compras e Entregas',
      message: '📦 *Compras, Entregas & Lojas*\n\nSelecione a opção que melhor descreve sua dúvida:',
    },
  });

  const stepContratos = await prisma.step.create({
    data: {
      title: 'Menu Contratos e Planos',
      message: '📜 *Contratos, Multas & Planos*\n\nSelecione a opção desejada para ver as orientações do PROCON:',
    },
  });

  const stepGarantiasMenu = await prisma.step.create({
    data: {
      title: 'Menu Geral de Garantias',
      message: '🔧 *Garantias & Defeitos (Vícios)*\n\nEste tema é extenso. Escolha uma das abordagens abaixo para filtrar sua dúvida:',
    },
  });

  const stepGarantiasPrazos = await prisma.step.create({
    data: {
      title: 'Submenu Garantias Prazos',
      message: '📂 *Tipos, Prazos e Legislação de Garantia*\n\nSelecione a opção específica:',
    },
  });

  const stepGarantiasProblemas = await prisma.step.create({
    data: {
      title: 'Submenu Garantias Problemas',
      message: '📂 *Problemas Práticos e Direitos na Garantia*\n\nSelecione o seu cenário atual:',
    },
  });

  const stepGerais = await prisma.step.create({
    data: {
      title: 'Menu Duvidas Gerais',
      message: '🏢 *Informações Úteis & Atendimento*\n\nSelecione o assunto de seu interesse para ver as orientações do PROCON:',
    },
  });

  // =========================================================================
  // NÍVEL 3: RESPOSTAS FINAIS (TEXTO COMPLETO DO PROCON)
  // =========================================================================

  const q1SeguroCartao = await prisma.step.create({
    data: {
      title: 'Questao 1 - Seguro Cartao',
      message: 'De acordo com o art. 6°, inciso III, art. 14, Caput, art. 39, inciso III, art. 42, parágrafo único. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo o cancelamento imediato, devolução em dobro dos valores cobrados indevidamente e o envio do contrato.\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Faturas com a descrição desde que começou desconto;\n- Comprovantes de pagamentos;\n- Mensagens e e-mails caso tenha;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, sendo necessário o consumidor comparecer presencialmente ao Procon para obter uma consulta.',
    },
  });

  const q2EmprestimoQuitado = await prisma.step.create({
    data: {
      title: 'Questao 2 - Emprestimo Quitado',
      message: 'De acordo com os art. 42 do CDC e o art. 14 do CDC. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo a devolução em dobro dos valores cobrados indevidamente e a interrupção imediata dos descontos.\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Descontos na folha de pagamento;\n- Comprovantes de pagamentos;\n- Mensagens e e-mails caso tenha;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, sendo necessário o consumidor comparecer presencialmente ao Procon para obter uma consulta.',
    },
  });

  const q3BeneficioNaoContratado = await prisma.step.create({
    data: {
      title: 'Questao 3 - Beneficio nao Contratado',
      message: 'De acordo com os art. 4, inciso I, art. 14, Caput, art. 39, inciso III, art. 42, parágrafo único. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo o cancelamento imediato, devolução em dobro dos valores cobrados indevidamente e o envio do contrato.\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Extrato consignado do INSS;\n- Extrato bancário com a data de inclusão;\n- Histórico de crédito;\n- Mensagens e e-mails caso tenha;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, pois se o consumidor tiver usado o dinheiro o Procon só poderá requerer uma proposta de quitação, por esse motivo o consumidor deve comparecer até o Procon para ter uma consulta.',
    },
  });

  const q6RmcRcc = await prisma.step.create({
    data: {
      title: 'Questao 6 - RMC e RCC',
      message: 'De acordo com os art.39, inciso III do CDC, art. 42 do CDC e o art. 14 do CDC. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo a devolução em dobro dos valores cobrados indevidamente e a interrupção imediata dos descontos, salvo engano justificável.\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Extrato consignado do INSS;\n- Extrato bancário com a data de inclusão;\n- Histórico de crédito;\n- Mensagens e e-mails caso tenha;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, pois se o consumidor tiver usado o dinheiro, o Procon só poderá requerer uma proposta de quitação, por esse motivo o consumidor deve comparecer até o Procon para ter uma consulta.',
    },
  });

  const q25PrescricaoDivida = await prisma.step.create({
    data: {
      title: 'Questao 25 - Prescricao Divida',
      message: 'Não. Dívidas com mais de cinco anos não podem ser cobradas judicialmente, e isso acontece graças ao instituto da prescrição. No entanto, a prescrição não extingue a dívida, ou seja, ela continua existindo para a empresa credora. Isso significa que, embora o devedor não possa mais ser cobrado judicialmente e o nome do devedor não pode mais ser negativado por esse débito, ao empresa credora ainda pode disponibilizar a oportunidade de quitar as pendências.',
    },
  });

  const q7PlataformaOnline = await prisma.step.create({
    data: {
      title: 'Questao 7 - Plataforma Online',
      message: 'Sim, o consumidor deve entrar em contato tanto com a loja vendedora quanto com a plataforma online, de acordo com o art. 14 do CDC que impõe responsabilidade objetiva ao fornecedor de serviços ou produtos, que inclui a loja e, em muitos casos, a plataforma que intermedia a venda, especialmente se ela facilita ou garante a transação.',
    },
  });

  const q15PrazoEntrega = await prisma.step.create({
    data: {
      title: 'Questao 15 - Prazo Entrega',
      message: 'O consumidor pode, a seu critério: I) exigir o cumprimento forçado da obrigação, nos termos da oferta, presentation ou publicidade; II) aceitar outro produto ou prestação de serviço equivalente; III) rescindir o contrato, com direito à restituição de quantia eventualmente antecipada, monetariamente atualizada.',
    },
  });

  const q4RecusaContrato = await prisma.step.create({
    data: {
      title: 'Questao 4 - Recusa Contrato',
      message: 'De acordo com os art. 6º, III, art. 46, do CDC, garante o direito à informação clara e determina que o consumidor deve ter acesso prévio ao conteúdo do contrato. Sendo assim, o fornecedor é obrigado a fornecer o documento, podendo a negativa gerar medidas administrativas ou judiciais. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo a documentação\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Números de protocolo;\n- Mensagens e e-mails requerendo o envio do contrato;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, sendo necessário o consumidor comparecer presencialmente ao Procon para obter uma consulta.',
    },
  });

  const q5CancelamentoTelefone = await prisma.step.create({
    data: {
      title: 'Questao 5 - Cancelamento Telefone',
      message: 'De acordo com o art. 6°, inciso III, art. 39, inciso V e o art. 51 do CDC. O consumidor tem total direito de abrir uma reclamação no Procon, requerendo o cancelamento imediato do serviço, sem entraves indevidos, podendo exigir a suspensão das cobranças e buscar medidas administrativas ou judiciais caso a empresa persista na recusa.\n\nSendo necessário a devida documentação:\n- RG com CPF;\n- Contrato;\n- Comprovantes de pagamentos;\n- Mensagens e e-mails caso tenha;\n- Número de protocolo requerendo o cancelamento;\n- CNPJ matriz do fornecedor;\n\nVale ressaltar que, os casos possuem variações, podendo a empresa cobrar uma multa por quebra de contrato ou fidelidade, sendo necessário o consumidor comparecer presencialmente ao Procon para obter uma consulta.',
    },
  });

  const q9MultaContrato = await prisma.step.create({
    data: {
      title: 'Questao 9 - Multa Contrato',
      message: 'Sim, é possível cancelar um contrato assinado sem pagar multa, mas apenas em casos específicos como: direito de arrependimento (até 7 dias para compras fora da loja), descumprimento de cláusulas pela empresa (falha no serviço), ou se a multa for considerada abusiva (geralmente superior a 10% do valor restante).',
    },
  });

  const q10Fidelidade = await prisma.step.create({
    data: {
      title: 'Questao 10 - Fidelidade',
      message: 'Sim, um contrato pode ter cláusula de fidelidade (ou de permanência), sendo comum em serviços de telecomunicações, academias e assinaturas. Ela obriga o consumidor a manter o serviço por um tempo mínimo (máximo de 12 meses para pessoas físicas), a multa por cancelamento antecipado deve ser proporcional ao tempo restante. O Artigo 57 da Resolução nº 632/2014 da Anatel estabelece que operadoras podem oferecer benefícios (descontos, aparelhos) indevidos em troca de fidelidade, com prazo máximo de 12 meses. A multa por quebra de contrato deve ser proporcional ao tempo restante and ao benefício, sendo ilegal se a rescisão for por falha da operadora.',
    },
  });

  const q11ArrependimentoSeteDias = await prisma.step.create({
    data: {
      title: 'Questao 11 - Arrependimento',
      message: 'O Direito de Arrependimento (Art. 49 do CDC. O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto ou serviço, sempre que a contatação de fornecimento de produtos e serviços ocorrer fora do estabelecimento comercial, especialmente por telefone ou a domicílio.) Parágrafo único. Se o consumidor exercitar o direito de arrependimento previsto neste artigo, os valores eventualmente pagos, a qualquer título, durante o prazo de reflexão, serão devolvidos, de imediato, monetariamente atualizados.',
    },
  });

  const q28TiposGarantia = await prisma.step.create({
    data: {
      title: 'Questao 28 - Tipos Garantia',
      message: 'Existem três tipos principais de garantia: Garantia Legal, Garantia Contratual e Garantia Estendida Art.26. O direito de reclamar pelos vícios aparentes ou de fácil constatação caduca em: I - trinta dias, tratando-se de fornecimento de serviço e de produtos não duráveis; II - noventa dias, tratando-se de fornecimento de serviço e de produtos duráveis. Art. 50. A garantia contratual é complementar à legal e será conferida mediante termo escrito.',
    },
  });

  const q29GarantiaLegal = await prisma.step.create({
    data: {
      title: 'Questao 29 - Garantia Legal',
      message: 'A garantia legal é aquela prevista no Código de Defesa do Consumidor (CDC) e independe de contrato ou termo escrito. Ela é de: 30 dias para produtos ou serviços não duráveis (ex: alimentos, serviços de lavanderia). 90 dias para produtos ou serviços duráveis (ex: eletrodomésticos, móveis, eletrônicos). Art.26. O direito de reclamar pelos vícios aparentes ou de fácil constatação caduca em: I - trinta dias, tratando-se de fornecimento de serviço e de produtos não duráveis; II - noventa dias, tratando-se de fornecimento de serviço e de produtos duráveis.',
    },
  });

  const q31GarantiaContratual = await prisma.step.create({
    data: {
      title: 'Questao 31 - Garantia Contratual',
      message: 'É a garantia oferecida pelo fabricante ou fornecedor de forma complementar à garantia legal. Ela vem descrita em termo escrito e pode ter prazo maior (ex: 1 ano, 2 anos). Importante: A garantia contratual não substitui a garantia legal; ela é complementar. Ambas têm início no momento da entrega do produto, porém o prazo da garantia contratual soma- se ao da garantia legal. Art. 50. A garantia contratual é complementar à legal e será conferida mediante termo escrito. Parágrafo único. O termo de garantia ou equivalente deve ser padronizado...',
    },
  });

  const q32GarantiaEstendida = await prisma.step.create({
    data: {
      title: 'Questao 32 - Garantia Estendida',
      message: 'É um serviço adicional, normalmente pago, que prolonga o prazo da garantia contratual após o término dela. Ela funciona como um seguro e deve ter contrato específico detalhando cobertura, prazos e condições. Art. 39. É vedado ao fornecedor de produtos ou serviços, dentre outras práticas abusivas: I - condicionar o fornecimento de produto ou de serviço ao fornecimento de outro produto ou serviço, bem como, sem justa causa, a limites quantitativos;',
    },
  });

  const q36ProdutosUsados = await prisma.step.create({
    data: {
      title: 'Questao 36 - Produtos Usados',
      message: 'Sim. Produtos usados também possuem garantia legal of 90 dias (se duráveis), salvo se houver informação clara e específica sobre alguma limitação previamente informada ao consumidor. Art. 24. A garantia legal de adequação do produto ou serviço independe de termo expresso, vedada a exoneração contratual do fornecedor.',
    },
  });

  const q33NegarGarantia = await prisma.step.create({
    data: {
      title: 'Questao 33 - Negar Garantia',
      message: 'Pode haver negativa quando: O defeito foi causado por mau uso; O produto foi alterado por terceiros não autorizados; Houve dano por acidente ou queda. Contudo, o fornecedor deve comprovar o mau uso. Art.12 § 3° O fabricante, o construtor, o produtor ou importador só não será responsabilizado quando provar: III - a culpa exclusiva do consumidor ou de terceiro.',
    },
  });

  const q34NaoResolvido30Dias = await prisma.step.create({
    data: {
      title: 'Questao 34 - Nao Resolvido 30 Dias',
      message: 'Segundo o Código de Defesa do Consumidor, se o defeito não foi solucionado em até 30 dias, o consumidor pode escolher entre: Substituição do produto por outro novo; Devolução do valor pago; Abatimento proporcional do preço. Art. 18 § 1° Não sendo o vício sanado no prazo máximo de trinta dias, pode o consumidor exigir, alternativamente e à sua escolha: I - a substituição do produto por outro da mesma espécie, em perfeitas condições de uso; II- a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de eventuais perdas e danos; II - o abatimento proporcional do preço.',
    },
  });

  const q35NotaFiscalGarantia = await prisma.step.create({
    data: {
      title: 'Questao 35 - Nota Fiscal',
      message: 'A nota fiscal facilita a comprovação da compra, mas o consumidor pode utilizar outros meios de prova (extrato bancário, fatura do cartão, comprovante de pedido). Art. 6º São direitos básicos do consumidor: VIII - a facilitação da defesa de seus direitos, inclusive com a inversão do ônus da prova...',
    },
  });

  const q44DefeitoCarroUsado = await prisma.step.create({
    data: {
      title: 'Questao 44 - Carro Usado',
      message: 'Não, neste caso será possível solicitar o cumprimento da garantia, conforme Art. 18 do CDC, entretanto, não será possível requerer o cancelamento da compra ou troca do veículo, considerando que se trata de um semi-novo.',
    },
  });

  const q8Duplicidade = await prisma.step.create({
    data: {
      title: 'Questao 8 - Reclamacao Online x Presencial',
      message: 'Não, pois não podemos abrir reclamação em duplicidade do mesmo assunto.',
    },
  });

  const q24Portabilidade = await prisma.step.create({
    data: {
      title: 'Questao 24 - Portabilidade Beneficio',
      message: 'Sim, a portabilidade deve ser solicitada apenas pelo titular da conta bancária. Porém caso exista algum tipo de empréstimo pessoal ou uma divida com o banco, sua portabilidade pode não ser concluída, pois é previsto em contrato.',
    },
  });

  const q26PrazoResposta = await prisma.step.create({
    data: {
      title: 'Questao 26 - Prazo Resposta Fornecedor',
      message: 'Após a abertura da CIP (reclamação) o fornecedor tem um prazo de até 10 dias corridos para apresentar sua resposta no sistema. Caso não houver retorno da parte reclamada ou não for resolvido o problema, agendaremos uma audiência conciliatória.',
    },
  });

  const q27DocumentosGerais = await prisma.step.create({
    data: {
      title: 'Questao 27 - Documentos Reclamacao',
      message: 'Cada caso exige uma análise. No entanto, os documentos que são sempre essenciais são: CNPJ da matriz do fornecedor, comprovantes do problema e documento pessoal do consumidor. Pode ser necessária a solicitação de outros documentos. Por isso, é essencial o comparecimento do consumidor à sede do Procon para a realização de uma análise detalhada do caso.',
    },
  });

  const q47DireitoImobiliario = await prisma.step.create({
    data: {
      title: 'Questao 47 - Direito Imobiliario',
      message: 'Em casos que envolvam o direito imobiliário, o mesmo será regido pela LEI No 8.245, DE 18 DE OUTUBRO DE 1991., conhecida como Lei do Inquilinato. Neste caso, o PROCON não poderá intervir ou orientar o consumidor, pois o mesmo deverá ser orientado pela legislação específica.',
    },
  });

  // =========================================================================
  // MAPAS DE ACESSO E CONEXÕES (VÍNCULOS)
  // =========================================================================

  // 1. Menu Principal -> Abre 2 Botões Clicáveis
  await prisma.option.createMany({
    data: [
      { text: '💡 Dúvidas Gerais', stepId: menuPrincipal.id, nextStepId: menuDuvidasSub.id },
      { text: '🗓️ Agendar Consulta', stepId: menuPrincipal.id, nextStepId: stepAgendamento.id },
    ],
  });

  // 2. Submenu de Dúvidas -> Abre 3 Botões Clicáveis (Os Grandes Pilares)
  await prisma.option.createMany({
    data: [
      { text: '📦 Produtos & Compras', stepId: menuDuvidasSub.id, nextStepId: stepCompras.id }, 
      { text: '📄 Serviços/Contratos', stepId: menuDuvidasSub.id, nextStepId: stepContratos.id }, 
      { text: '🏢 Informações Úteis', stepId: menuDuvidasSub.id, nextStepId: stepGerais.id }, 
    ],
  });

  // 3. Modificamos os menus intermediários para conectarem suas listas de opções:
  
  // Pilar Produtos -> Encaminha para os submenus existentes de Compras ou Garantias
  await prisma.option.createMany({
    data: [
      { text: 'Lojas e Entregas', stepId: stepCompras.id, nextStepId: q15PrazoEntrega.id },
      { text: 'Plataformas/Market', stepId: stepCompras.id, nextStepId: q7PlataformaOnline.id },
      { text: 'Garantias e Defeitos', stepId: stepCompras.id, nextStepId: stepGarantiasMenu.id },
      { text: '⬅️ Voltar ao Início', stepId: stepCompras.id, nextStepId: menuPrincipal.id },
    ],
  });

  // Pilar Serviços -> Encaminha para Finanças ou Contratos
  await prisma.option.createMany({
    data: [
      { text: 'Bancos e Finanças', stepId: stepContratos.id, nextStepId: stepFinancas.id },
      { text: 'Recusa de Contrato', stepId: stepContratos.id, nextStepId: q4RecusaContrato.id },
      { text: 'Dificuldade Cancelar', stepId: stepContratos.id, nextStepId: q5CancelamentoTelefone.id },
      { text: 'Cobrança de Multa', stepId: stepContratos.id, nextStepId: q9MultaContrato.id },
      { text: 'Cláusula Fidelidade', stepId: stepContratos.id, nextStepId: q10Fidelidade.id },
      { text: 'Arrependimento 7 dias', stepId: stepContratos.id, nextStepId: q11ArrependimentoSeteDias.id },
      { text: '⬅️ Voltar ao Início', stepId: stepContratos.id, nextStepId: menuPrincipal.id },
    ],
  });

  // Conexões de Finanças (Submenu interno de Serviços)
  await prisma.option.createMany({
    data: [
      { text: 'Seguro Cartão', stepId: stepFinancas.id, nextStepId: q1SeguroCartao.id },
      { text: 'Empréstimo Folha', stepId: stepFinancas.id, nextStepId: q2EmprestimoQuitado.id },
      { text: 'Empréstimo Benefício', stepId: stepFinancas.id, nextStepId: q3BeneficioNaoContratado.id },
      { text: 'Cobrança RMC/RCC', stepId: stepFinancas.id, nextStepId: q6RmcRcc.id },
      { text: 'Dívida de 5 anos', stepId: stepFinancas.id, nextStepId: q25PrescricaoDivida.id },
      { text: '⬅️ Voltar', stepId: stepFinancas.id, nextStepId: stepContratos.id },
    ],
  });

  // Conexões de Garantias Geral
  await prisma.option.createMany({
    data: [
      { text: '📂 Prazos e Tipos', stepId: stepGarantiasMenu.id, nextStepId: stepGarantiasPrazos.id },
      { text: '📂 Problemas Práticos', stepId: stepGarantiasMenu.id, nextStepId: stepGarantiasProblemas.id },
      { text: '⬅️ Voltar', stepId: stepGarantiasMenu.id, nextStepId: stepCompras.id },
    ],
  });

  // Opções do Submenu: Prazos e Tipos de Garantia
  await prisma.option.createMany({
    data: [
      { text: 'Tipos de Garantia', stepId: stepGarantiasPrazos.id, nextStepId: q28TiposGarantia.id },
      { text: 'Garantia Legal', stepId: stepGarantiasPrazos.id, nextStepId: q29GarantiaLegal.id },
      { text: 'Garantia Contratual', stepId: stepGarantiasPrazos.id, nextStepId: q31GarantiaContratual.id },
      { text: 'Garantia Estendida', stepId: stepGarantiasPrazos.id, nextStepId: q32GarantiaEstendida.id },
      { text: 'Produtos Usados', stepId: stepGarantiasPrazos.id, nextStepId: q36ProdutosUsados.id },
      { text: '⬅️ Voltar', stepId: stepGarantiasPrazos.id, nextStepId: stepGarantiasMenu.id },
    ],
  });

  // Opções do Submenu: Problemas Práticos de Garantia
  await prisma.option.createMany({
    data: [
      { text: 'Fornecedor nega ajuda', stepId: stepGarantiasProblemas.id, nextStepId: q33NegarGarantia.id },
      { text: 'Estourou os 30 dias', stepId: stepGarantiasProblemas.id, nextStepId: q34NaoResolvido30Dias.id },
      { text: 'Precisa de Nota Fiscal?', stepId: stepGarantiasProblemas.id, nextStepId: q35NotaFiscalGarantia.id },
      { text: 'Defeito em Carro Usado', stepId: stepGarantiasProblemas.id, nextStepId: q44DefeitoCarroUsado.id },
      { text: '⬅️ Voltar', stepId: stepGarantiasProblemas.id, nextStepId: stepGarantiasMenu.id },
    ],
  });

  // Opções do Submenu: Informações Úteis
  await prisma.option.createMany({
    data: [
      { text: 'Já abri online, e agora?', stepId: stepGerais.id, nextStepId: q8Duplicidade.id },
      { text: 'Portabilidade Benefício', stepId: stepGerais.id, nextStepId: q24Portabilidade.id },
      { text: 'Prazo pro Fornecedor', stepId: stepGerais.id, nextStepId: q26PrazoResposta.id },
      { text: 'Documentos Gerais', stepId: stepGerais.id, nextStepId: q27DocumentosGerais.id },
      { text: 'Aluguel/Imóvel (Lei)', stepId: stepGerais.id, nextStepId: q47DireitoImobiliario.id },
      { text: '⬅️ Voltar ao Início', stepId: stepGerais.id, nextStepId: menuPrincipal.id },
    ],
  });

  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });