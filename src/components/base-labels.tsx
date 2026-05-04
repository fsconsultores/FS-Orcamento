export function baseLabelFromOrgao(orgao: string | null | undefined): string {
  if (!orgao) return '—';
  if (orgao === 'PROPRIO') return 'Própria';
  return orgao;
}