import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

type Pub = { id: string; contenido: string; sensibilidad: string; creado_en: string; perfiles: { nombre_completo: string } | null };

export default function Tablon() {
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data } = await supabase.from('publicaciones')
      .select('id, contenido, sensibilidad, creado_en, perfiles(nombre_completo)')
      .is('grupo_id', null).order('creado_en', { ascending: false }).limit(50);
    setPubs((data ?? []) as any);
    setCargando(false); setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function publicar() {
    const contenido = texto.trim();
    if (!contenido) return;
    setEnviando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('publicaciones')
      .insert({ autor_id: user!.id, grupo_id: null, contenido, sensibilidad: 'interna' });
    setEnviando(false);
    if (error) { Alert.alert('No se pudo publicar', error.message); return; }
    setTexto('');
    cargar();
  }

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Tablón' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        <View style={s.tarjeta}>
          <TextInput style={s.input} placeholder="Compartí algo con el equipo…" multiline
            value={texto} onChangeText={setTexto} />
          <Pressable style={[s.btn, enviando && { opacity: 0.6 }]} onPress={publicar} disabled={enviando}>
            <Text style={s.btnTxt}>{enviando ? 'Publicando…' : 'Publicar'}</Text>
          </Pressable>
        </View>

        {pubs.length === 0 && <Text style={s.vacio}>Todavía no hay publicaciones.</Text>}
        {pubs.map((p) => (
          <View key={p.id} style={s.tarjeta}>
            <Text style={s.cuerpo}>{p.contenido}</Text>
            <Text style={s.meta}>{p.perfiles?.nombre_completo || '—'} · {new Date(p.creado_en).toLocaleString('es-VE')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vacio: { color: '#4b5563' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
  btn: { backgroundColor: '#0033A0', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800' },
  cuerpo: { color: '#111827', fontSize: 15 },
  meta: { color: '#4b5563', fontSize: 12 },
});
