import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { payments } from './domain';
import { deleteFavorite, favoriteKey, favoriteNameLimit, saveFavorite, type Favorite } from './favorites';
import { Confirm } from './forms';
import { useStore } from './store';
import { Button, Choices, Copy, Dialog, Field, Icon, row } from './ui';
import { useSubmit } from './use-submit';

type FavoriteDialog = { screen: 'list' } | { screen: 'form'; favorite?: Favorite };

export function FavoriteActions({ onSelect }: { onSelect: (favorite: Favorite) => void }) {
  const { data, colors } = useStore();
  const [dialog, setDialog] = useState<FavoriteDialog>();
  const selectionStarted = useRef(false);
  const favorites = data?.favorites ?? [];
  const categories = new Map(data?.categories.map(category => [category.id, category.name]));

  function selectFavorite(favorite: Favorite) {
    if (selectionStarted.current) return;
    selectionStarted.current = true;
    setDialog(undefined);
    onSelect(favorite);
  }

  return <>
    <Button label="Favoritos" icon="star-outline" disabled={!data} onPress={() => {
      selectionStarted.current = false;
      setDialog({ screen: 'list' });
    }} />
    {dialog?.screen === 'list' && <Dialog title="Favoritos de gastos" onClose={() => setDialog(undefined)}>
      <Button label="Novo favorito" icon="add" onPress={() => setDialog({ screen: 'form' })} />
      {!favorites.length && <Copy muted>Crie um favorito para agilizar seus gastos frequentes.</Copy>}
      {favorites.map(favorite => <View key={favorite.id} style={[row, styles.favorite, { borderColor: colors.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={'Usar favorito ' + favorite.name}
          onPress={() => selectFavorite(favorite)} style={({ pressed }) => [row, styles.select, pressed && { opacity: 0.75 }]}>
          <Icon name="star-outline" size={18} />
          <View style={styles.name}>
            <Copy style={{ fontWeight: '800' }}>{favorite.name}</Copy>
            <Copy muted>{[categories.get(favorite.categoryId), favorite.payment].filter(Boolean).join(' · ')}</Copy>
          </View>
        </Pressable>
        <Button label={'Editar favorito ' + favorite.name} compact icon="create-outline"
          onPress={() => setDialog({ screen: 'form', favorite })} />
      </View>)}
    </Dialog>}
    {dialog?.screen === 'form' && <FavoriteForm favorite={dialog.favorite}
      onClose={() => setDialog({ screen: 'list' })} />}
  </>;
}

function FavoriteForm({ favorite, onClose }: { favorite?: Favorite; onClose: () => void }) {
  const { data, mutate } = useStore();
  const [name, setName] = useState(favorite?.name ?? '');
  const [categoryId, setCategoryId] = useState(favorite?.categoryId ?? 0);
  const [payment, setPayment] = useState(favorite?.payment ?? '');
  const [note, setNote] = useState(favorite?.note ?? '');
  const [deleting, setDeleting] = useState(false);
  const { busy, feedback, setError, submit } = useSubmit();
  const categories = (data?.categories ?? []).filter(category => category.kind !== 'entrada');
  const close = () => { if (!busy) onClose(); };

  function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > favoriteNameLimit) {
      return setError('Informe um nome com até ' + favoriteNameLimit + ' caracteres.');
    }
    if (!categories.some(category => category.id === categoryId)) return setError('Selecione uma categoria de gasto.');
    const key = favoriteKey(trimmed);
    if (data?.favorites.some(item => item.id !== favorite?.id && favoriteKey(item.name) === key)) {
      return setError('Já existe um favorito com esse nome.');
    }
    void submit(() => mutate(db => saveFavorite(db, { name: trimmed, categoryId, payment, note }, favorite?.id),
      favorite ? 'Favorito atualizado.' : 'Favorito criado.'), onClose);
  }

  if (deleting && favorite) return <Confirm title="Excluir favorito?"
    message={'O favorito “' + favorite.name + '” será removido da lista.'}
    label="Excluir favorito" onClose={() => setDeleting(false)} action={async () => {
      await mutate(db => deleteFavorite(db, favorite.id), 'Favorito excluído.');
      onClose();
    }} />;

  return <Dialog title={favorite ? 'Editar favorito' : 'Novo favorito'} onClose={close}>
    <Field label="Nome do favorito" value={name} onChangeText={setName} maxLength={favoriteNameLimit} />
    <View style={{ gap: 6 }}>
      <Copy style={{ fontWeight: '700' }}>Categoria</Copy>
      <Choices items={categories.map(item => ({ key: item.id, label: item.name }))} value={categoryId} onChange={setCategoryId} />
    </View>
    <View style={{ gap: 6 }}>
      <Copy style={{ fontWeight: '700' }}>Pagamento (opcional)</Copy>
      <Choices items={[{ key: '', label: 'Sem forma' }, ...payments.map(key => ({ key, label: key }))]}
        value={payment} onChange={setPayment} />
    </View>
    <Field label="Descrição (opcional)" value={note} onChangeText={setNote} maxLength={120} />
    {feedback}
    <Button label="Salvar favorito" icon="checkmark" variant="primary" onPress={save} disabled={busy} />
    {favorite && <Button label="Excluir favorito" icon="trash-outline" variant="danger" disabled={busy}
      onPress={() => setDeleting(true)} />}
  </Dialog>;
}

const styles = StyleSheet.create({
  favorite: { borderTopWidth: 1, paddingTop: 6 },
  select: { flex: 1, minHeight: 44, paddingVertical: 7 },
  name: { flex: 1, minWidth: 0 },
});
