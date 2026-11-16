import { prisma } from '../../database/index.js';
import { sendInteractiveMessage } from '../metaAPI.js';
import { DOCUMENT_GUIDES } from './documentGuides.js';
import { MENU_OPTION } from '../whatsapp/messagePolicy.js';

const categories = [
  { id: 'doc_req_cartao', key: 'CARTAO_SEGURO', text: 'Seguro em cartão' },
  { id: 'doc_req_folha', key: 'EMPRESTIMO_FOLHA', text: 'Empréstimo em folha' },
  { id: 'doc_req_inss', key: 'INSS_RMC_RCC', text: 'Descontos no INSS' },
  { id: 'doc_req_contrato', key: 'CONTRATO_CANCELAMENTO', text: 'Contratos e cancelamento' },
  { id: 'doc_req_garantia', key: 'GARANTIA_VICIO', text: 'Produto com problema' },
  { id: 'doc_req_geral', key: 'GERAL', text: 'Outras reclamações' },
];
export const DOCUMENT_OPTIONS = [...categories, MENU_OPTION];
export const sendDocumentCategoryList = async (phone: string) => {
  await sendInteractiveMessage(phone, 'Documentos para atendimento no PROCON de Jacareí. Escolha o assunto para consultar a lista. Para sair, digite *menu*.', DOCUMENT_OPTIONS);
};

export const handleDocumentCategorySelection = async (phone: string, optionId: string) => {
  const category = categories.find(item => item.id === optionId);
  if (!category) {
    await sendInteractiveMessage(phone, 'Essa opção de documentos foi atualizada. Volte ao menu para consultar a lista.', [MENU_OPTION]);
    return;
  }
  // Prefere a lista vigente no banco, inclusive edições feitas pela equipe.
  const guide = await prisma.documentGuide.findUnique({ where: { categoryKey: category.key } })
    ?? DOCUMENT_GUIDES.find(item => item.categoryKey === category.key);
  if (!guide) return sendDocumentCategoryList(phone);
  const text = `Documentos — ${guide.categoryName}:\n\n${guide.requiredDocs.map(doc => `• ${doc}`).join('\n')}\n\n${guide.observations ?? ''}\n\nO CNPJ costuma estar na nota fiscal, contrato ou site da empresa. Se tiver dificuldade para reunir documentos, confirme com a equipe pelo (12) 3955-9130. Para continuar, digite *menu*.`;
  await sendInteractiveMessage(phone, text, [MENU_OPTION]);
  return text;
};
