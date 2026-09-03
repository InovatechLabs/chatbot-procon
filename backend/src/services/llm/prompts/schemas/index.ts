export const RAG_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    raciocinio: {
      type: "string",
      description: "Análise passo a passo: clareza do relato, qual lei se aplica e por quê, antes de decidir o tipo de resposta."
    },
    tipoResposta: {
      type: "string",
      enum: ["clarificacao", "orientacao_final", "redirecionamento"]
    },
    artigo: {
      type: ["string", "null"],
      description: "Preenchido apenas quando tipoResposta for 'orientacao_final'. Preencha APENAS o código do artigo (ex: 'Art. 42', 'Art. 51'). NUNCA inclua o texto da lei neste campo."
    },
    texto: {
      type: "string",
      description: "O texto final a ser enviado ao cidadão, sem metadados, sem tags de controle."
    }
  },
  required: ["raciocinio", "tipoResposta", "artigo", "texto"]
};