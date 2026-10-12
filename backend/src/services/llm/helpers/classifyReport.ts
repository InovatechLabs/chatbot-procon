import axios from "axios";
import { generateText } from "../../ollama/ollamaClient.js";

type Categoria =
  | 'CONSUMO'
  | 'FORA_ESCOPO_PARTICULAR'
  | 'FORA_ESCOPO_TRIBUTO'
  | 'FORA_ESCOPO_ILICITO'
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
      enum: ["CONSUMO", "FORA_ESCOPO_PARTICULAR", "FORA_ESCOPO_TRIBUTO", "FORA_ESCOPO_ILICITO", "AMBIGUO"]
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
Você é um classificador jurídico do PROCON. Sua ÚNICA tarefa é ler o relato abaixo e devolver uma classificação.

REGRA 1. ANTI-ASSUNÇÃO
- NUNCA presuma que "comprei" ou "contratei" significa automaticamente uma compra em loja/empresa. Pode ter sido de um vizinho (particular) ou um serviço ilícito. Se o texto não der pistas mínimas de O QUE foi negociado ou QUEM é o fornecedor, é estritamente proibido classificar como CONSUMO.
PORÉM, dúvidas teóricas ou perguntas gerais sobre leis e direitos contra empresas SÃO consideradas CONSUMO.

AVALIE NESTA ORDEM E ESCOLHA A CATEGORIA ADEQUADA:

- "AMBIGUO": Faltam informações para saber a natureza do negócio ou quem são as partes. Use se o relato disser apenas "comprei uma coisa", "fiz um contrato", "deu problema com o cara", sem especificar O QUE é ou DE QUEM foi comprado (se é loja ou particular).
- "FORA_ESCOPO_PARTICULAR": Negócio pontual entre pessoas físicas (sem fornecedor habitual). Ex: comprar carro usado de um vizinho, aluguel de imóvel direto com o proprietário, contratar um conhecido para um favor.
- "FORA_ESCOPO_TRIBUTO": Cobrança de impostos, taxas, multas (trânsito, prefeitura) por órgão público.
- "FORA_ESCOPO_ILICITO": O objeto do contrato é crime/contravenção. Ex: comprar drogas, armas, invasão de celular/whatsapp, documentos falsos. Use o teste: "Se entregue perfeitamente, seria crime?". Se SIM, é ilícito.
- "CONSUMO": Apenas se houver evidência (clara ou subentendida pelo contexto do produto) de uma relação entre consumidor e um fornecedor profissional (loja, empresa, site, banco, prestador de serviço profissional).

IMPORTANTE:
- Julgue pela NATUREZA DO SERVIÇO/PRODUTO CONTRATADO. (ex: "não devolveram meu dinheiro" não é CONSUMO se o serviço em si era ilegal ou particular).
- Não julgue se a pessoa é culpada de algo. Apenas classifique a situação.

HISTÓRICO DA CONVERSA:
${formattedHistory}

ÚLTIMA MENSAGEM DO CIDADÃO:
"${userQuestion}"

Classifique o relato acima.
No campo "categoria", coloque a categoria escolhida.
No campo "motivo", explique em uma frase o motivo da escolha, com base nas regras acima.
`;

  try {
    const raw = await generateText(classificationPrompt, CLASSIFICATION_SCHEMA, { temperature: 0.1 });
    const parsed = JSON.parse(raw);
    
    return parsed as ClassificationResult;
    
  } catch (err) {
    console.error('Falha ao parsear classificação, usando fallback AMBIGUO:', err);
    return { categoria: 'AMBIGUO', motivo: 'Falha no parsing da classificação' };
  }
};