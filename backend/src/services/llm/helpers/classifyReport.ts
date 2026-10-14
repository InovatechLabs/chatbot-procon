import { generateText } from "../../ollama/ollamaClient.js";

type Categoria =
  | 'CONSUMO'
  | 'FORA_ESCOPO_PARTICULAR'
  | 'FORA_ESCOPO_TRIBUTO'
  | 'FORA_ESCOPO_ILICITO'
  | 'AGENDAMENTO'
  | 'AMBIGUO';

interface ClassificationResult {
  categoria: Categoria;
  motivo: string;
}

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    categoria: {
      type: "string",
      enum: ["CONSUMO", "FORA_ESCOPO_PARTICULAR", "FORA_ESCOPO_TRIBUTO", "FORA_ESCOPO_ILICITO", "AGENDAMENTO", "AMBIGUO"]
    },
    motivo: { type: "string" }
  },
  required: ["categoria", "motivo"]
};

export const classifyReport = async (
  userQuestion: string,
  formattedHistory: string
): Promise<ClassificationResult> => {

  const classificationPrompt = `
Você é um classificador de intenção e triador jurídico do PROCON. Sua função é ler o histórico e a última mensagem do cidadão para categorizar o atendimento.

REGRA DE OURO (PRIORIDADE ABSOLUTA):
1. "AGENDAMENTO": Se a última mensagem indica que o cidadão quer agendar atendimento presencial, ir ao posto do PROCON, saber como/onde dar entrada fisicamente na reclamação ou falar com um atendente humano. 
   - Esta regra TEM PRIORIDADE SOBRE TODAS AS OUTRAS e NÃO exige detalhes de compra ou produto.

SE NÃO FOR AGENDAMENTO, AVALIE AS OUTRAS CATEGORIAS NA SEGUINTE ORDEM:

2. "FORA_ESCOPO_ILICITO": O objeto do contrato ou serviço é crime/contravenção (ex: comprar drogas, armas, invasão de celular/WhatsApp, documentos falsos).
3. "FORA_ESCOPO_TRIBUTO": Cobrança de impostos, IPTU, IPVA, taxas ou multas de trânsito por órgãos públicos.
4. "FORA_ESCOPO_PARTICULAR": Negócio pontual entre pessoas físicas sem habitualidade comercial (ex: comprar carro do vizinho, aluguel direto com proprietário sem imobiliária, favor entre amigos). NUNCA use para lojas, empresas ou dúvidas sobre procedimentos do PROCON.
5. "AMBIGUO": O relato é extremamente vago e impede saber se a negociação foi com loja ou particular (ex: "comprei um negócio aí", "fiz um contrato e deu ruim"), sem dar pistas do produto ou fornecedor.
6. "CONSUMO": Há evidência (clara ou implícita no contexto) de relação entre consumidor e fornecedor profissional (loja, empresa, site, banco, operadora, prestador habitual) OU dúvidas teóricas sobre o Código de Defesa do Consumidor.

HISTÓRICO DA CONVERSA:
${formattedHistory}

ÚLTIMA MENSAGEM DO CIDADÃO:
"${userQuestion}"

Classifique o relato acima.
No campo "categoria", coloque a categoria escolhida.
No campo "motivo", explique em uma frase curta o motivo da escolha.
`;

  try {
    const raw = await generateText(classificationPrompt, CLASSIFICATION_SCHEMA, { temperature: 0.1 });
    const parsed = JSON.parse(raw);
    
    return parsed as ClassificationResult;
    
  } catch (err) {
    console.error('Falha ao parsear classificação, usando fallback AMBIGUO:', err);
    return { categoria: 'AMBIGUO', motivo: 'Falha no parsing da resposta estruturada' };
  }
};