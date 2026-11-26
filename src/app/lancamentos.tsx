import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { writeBackupFile } from '../backup-file';
import { creditDebit } from '../credit';
import { brl, type Entry, type Kind } from '../domain';
import { entriesCsv } from '../entries-csv';
import { EntryForm } from '../forms';
import { MonthPicker } from '../month-picker';
import { useStore } from '../store';
import { Button, Choices, Copy, Empty, EntryRow, Field, Page, Section, wrap } from '../ui';

function searchText(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export default function Transactions() {
  const { data, month, today, colors } = useStore();
  const [kind, setKind] = useState<Kind | 'todos'>('todos');
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<Entry>();
  const [add, setAdd] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');
  const exporting = useRef(false);
  const categories = (data?.categories ?? []).filter(item => kind === 'todos' || item.kind === kind || item.kind === 'ambos');
  const selected = categories.some(item => item.id === category) ? category : 0;
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const categoryNames = new Map(categories.map(item => [item.id, item.name]));
  const cardNames = new Map(data?.cards.map(card => [card.id, card.name]));
  const entries = (data?.entries ?? []).filter(item => {
    if (kind !== 'todos' && item.kind !== kind) return false;
    if (selected && item.categoryId !== selected) return false;
    if (!searching) return true;

    const cardName = item.credit ? cardNames.get(item.credit.cardId) : '';
    const text = searchText([item.note, categoryNames.get(item.categoryId), item.payment, cardName,
      item.credit?.refundOf ? 'Estorno' : ''].join(' '));
    return terms.every(term => text.includes(term));
  });
  const totals = { gasto: 0, entrada: 0 };
  if (searching) {
    for (const entry of entries) totals[entry.kind] += entry.kind === 'gasto' ? creditDebit(entry) : entry.cents;
  }

  async function exportPeriod() {
    if (!data || exporting.current) return;
    exporting.current = true;
    setExportState('writing');
    try {
      const csv = entriesCsv(data.entries, data.categories, data.cards, today, data.invoiceBalances);
      const saved = await writeBackupFile('bolso-em-dia-lancamentos-' + month + '-' + Date.now() + '.csv', csv, 'text/csv');
      setExportState(saved ? 'done' : 'idle');
    } catch {
      setExportState('error');
    } finally {
      exporting.current = false;
    }
  }

  return <Page title="Lançamentos" subtitle="Consulte e organize seus gastos e entradas."
    action={<>
      <Button label="Novo lançamento" variant="primary" icon="add" disabled={!data} onPress={() => setAdd(true)} />
      {!!data?.cards.length && <Button label="Pagar fatura" icon="card-outline" onPress={() => router.navigate('/cartoes')} />}
      <Button label="Exportar CSV" icon="download-outline" disabled={!data || exportState === 'writing'}
        onPress={() => void exportPeriod()} />
    </>}>
    <MonthPicker />
    {(exportState === 'done' || exportState === 'error') && <Text accessibilityLiveRegion="polite"
      style={{ color: exportState === 'error' ? colors.danger : colors.brand }}>
      {exportState === 'done' ? 'CSV do período exportado.' : 'Não foi possível exportar o CSV.'}
    </Text>}
    {!!data && <>
      <Section title="Filtros">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field label="Buscar no histórico" placeholder="Descrição, categoria, pagamento ou cartão"
              value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          </View>
          {!!query && <Button label="Limpar busca" icon="close" compact onPress={() => setQuery('')} />}
        </View>
        <View style={{ gap: 7 }}>
          <Copy muted>Tipo</Copy>
          <Choices items={[{ key: 'todos', label: 'Todos' }, { key: 'gasto', label: 'Gastos' }, { key: 'entrada', label: 'Entradas' }]}
            value={kind} onChange={value => { setKind(value); setCategory(0); }} />
        </View>
        <View style={{ gap: 7 }}>
          <Copy muted>Categoria</Copy>
          <Choices items={[{ key: 0, label: 'Todas' }, ...categories.map(item => ({ key: item.id, label: item.name }))]}
            value={selected} onChange={setCategory} />
        </View>
        {(searching || kind !== 'todos' || selected !== 0) && <Copy muted>O CSV inclui todo o período selecionado.</Copy>}
      </Section>
      <Section title={entries.length === 1 ? '1 lançamento' : entries.length + ' lançamentos'}>
        {searching && entries.length > 0 && <View style={wrap}>
          {totals.gasto !== 0 && <Copy muted>Gastos encontrados: {brl(totals.gasto)}</Copy>}
          {totals.entrada > 0 && <Copy muted>Entradas encontradas: {brl(totals.entrada)}</Copy>}
        </View>}
        {entries.length ? entries.map(entry => <EntryRow key={entry.id} entry={entry} onPress={() => setEdit(entry)} />)
          : <Empty title="Nenhum lançamento encontrado" icon="receipt-outline"
            detail={searching ? 'Tente outros termos ou ajuste os filtros do período.'
              : kind === 'todos' && !selected ? 'Use Novo lançamento para registrar um valor neste período.'
              : 'Altere os filtros para consultar outros lançamentos do período.'} />}
      </Section>
    </>}
    {(add || edit) && <EntryForm entry={edit} initialKind={kind === 'entrada' ? 'entrada' : 'gasto'}
      onClose={() => { setEdit(undefined); setAdd(false); }} />}
  </Page>;
}
