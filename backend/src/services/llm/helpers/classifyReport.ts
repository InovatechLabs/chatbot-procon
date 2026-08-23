import axios from "axios";

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

export const classifyReport = async (
  userQuestion: string,
  formattedHistory: string
): Promise<ClassificationResult> => {
  const classificationPrompt = `
Você é um classificador jurídico. Sua ÚNICA tarefa é ler o relato abaixo e devolver uma classificação em JSON.

CATEGORIAS POSSÍVEIS:
- "CONSUMO": há uma relação lícita entre consumidor e fornecedor (pessoa física ou jurídica que oferece produtos/serviços de forma habitual/profissional).
- "FORA_ESCOPO_PARTICULAR": negócio pontual entre duas pessoas físicas, sem que nenhuma delas atue como fornecedora habitual.
- "FORA_ESCOPO_TRIBUTO": cobrança de imposto, taxa, multa ou tributo por órgão público.
- "FORA_ESCOPO_ILICITO": o produto, serviço ou atividade CONTRATADA é, em si, uma prática criminosa. Use o seguinte teste: "Se o serviço/produto tivesse sido entregue exatamente como combinado, isso configuraria crime ou contravenção?". Se a resposta for SIM, classifique aqui — independentemente de o cidadão ter sido vítima de um golpe dentro dessa negociação ilícita. Exemplos do tipo de raciocínio (não é lista fechada): invasão de contas/dispositivos alheios, venda de drogas ou armas ilegais, documentos falsos, contrabando, exploração de pessoas, serviços de "hackeamento".
- "AMBIGUO": faltam informações essenciais para decidir (ex: não fica claro se o vendedor é particular ou loja).

IMPORTANTE:
- Julgue pela NATUREZA DO SERVIÇO/PRODUTO CONTRATADO, não pela natureza da reclamação (ex: "não devolveram meu dinheiro" não torna o caso CONSUMO se o serviço em si era ilegal).
- Não julgue se a pessoa é culpada de algo. Apenas classifique a situação relatada.

HISTÓRICO DA CONVERSA:
${formattedHistory}

ÚLTIMA MENSAGEM DO CIDADÃO:
"${userQuestion}"

Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, no formato:
{"categoria": "CONSUMO", "motivo": "explicação breve em uma frase"}
`;

  const ollamaUrl = 'https://monetary-trek-relay-wash.trycloudflare.com/api/generate';

  const response = await axios.post(ollamaUrl, {
    model: 'gemma3:12b',
    prompt: classificationPrompt,
    stream: false,
    options: {
      temperature: 0.1, 
    },
    format: 'json' 
  });

  const raw = response.data.response.trim();

  try {
    const parsed = JSON.parse(raw);
    const categoriasValidas: Categoria[] = [
      'CONSUMO', 'FORA_ESCOPO_PARTICULAR', 'FORA_ESCOPO_TRIBUTO',
      'FORA_ESCOPO_ILICITO', 'AMBIGUO'
    ];
    if (!categoriasValidas.includes(parsed.categoria)) {
      throw new Error(`Categoria inválida retornada: ${parsed.categoria}`);
    }
    return parsed as ClassificationResult;
  } catch (err) {
    console.error('Falha ao parsear classificação, usando fallback AMBIGUO:', raw);
    return { categoria: 'AMBIGUO', motivo: 'Falha no parsing da classificação' };
  }
};