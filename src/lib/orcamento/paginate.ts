/**
 * Busca todas as linhas de uma query paginada em PARALELO em vez de
 * sequencial: pede a 1ª página já com `count: 'exact'`, e se houver mais
 * páginas, dispara todas de uma vez via Promise.all. Em tabelas grandes
 * (milhares de linhas, várias páginas de 1000) isso é a diferença entre
 * somar a latência de cada página (segundos) e pagar só a latência da mais
 * lenta (a mesma ordem de grandeza de UMA página).
 *
 * `buildQuery` recebe [from, to] (mesmo formato de `.range()`) e deve
 * retornar a query já com `.select(cols, { count: 'exact' })` — o `count`
 * só é de fato usado na resposta da 1ª chamada.
 */
export async function fetchAllPaginatedParallel<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>,
  batch = 1000
): Promise<T[]> {
  const first = await buildQuery(0, batch - 1)
  if (first.error) throw new Error(first.error.message)
  const rows: T[] = [...(first.data ?? [])]

  const total = first.count
  if (total != null && total > batch) {
    const pagePromises: Promise<T[]>[] = []
    for (let start = batch; start < total; start += batch) {
      pagePromises.push(
        Promise.resolve(buildQuery(start, start + batch - 1)).then(({ data, error }) => {
          if (error) throw new Error(error.message)
          return data ?? []
        })
      )
    }
    for (const page of await Promise.all(pagePromises)) rows.push(...page)
  } else if (total == null && (first.data?.length ?? 0) === batch) {
    // count indisponível (não deveria acontecer se o caller sempre pede
    // count: 'exact') — cai para paginação sequencial seguindo o cursor,
    // só como rede de segurança pra nunca perder dados.
    let start = batch
    while (true) {
      const { data, error } = await buildQuery(start, start + batch - 1)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if ((data?.length ?? 0) < batch) break
      start += batch
    }
  }

  return rows
}
