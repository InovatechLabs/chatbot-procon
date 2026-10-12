export type Categoria =
  | 'CONSUMO'
  | 'FORA_ESCOPO_PARTICULAR'
  | 'FORA_ESCOPO_TRIBUTO'
  | 'FORA_ESCOPO_ILICITO'
  | 'AMBIGUO';

export interface ClassificationResult {
  categoria: Categoria;
  motivo: string;
};
