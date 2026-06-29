import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

type Aviso = { id: string; titulo: string; cuerpo: string | null; leida: boolean; creado_en: string };

export default function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data } = await supabase.from('notificaciones')
      .select('id, titulo, cuerpo, leida, creado_en')
      .eq('destinatario_id', user.id).order('creado_en', { ascending: false }).limit(100);
    setAvisos((data ?? []) as Aviso[]);
    setCargando(false); setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function marcarTodo() {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('notificaciones').update({ leida: true })
      .eq('destinatario_id', user!.id).eq('leida', false);
    cargar();
  }

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;
  const noLeidas = avisos.filter((a) => !a.leida).length;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{
        title: 'Avisos',
        headerRight: () => noLeidas > 0
          ? <Pressable onPress={marcarTodo}><Text style={s.accion}>Marcar leído</Text></Pressable>
          : null,
      }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        {avisos.length === 0 && <Text style={s.vacio}>No tenés avisos. 🎉</Text>}
        {avisos.map((a) => (
          <View key={a.id} style={[s.tarjeta, !a.leida && s.noLeida]}>
            <Text style={s.titulo}>{a.titulo}</Text>
            {!!a.cuerpo && <Text style={s.cuerpo}>{a.cuerpo}</Text>}
            <Text style={s.meta}>{new Date(a.creado_en).toLocaleString('es-VE')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  accion: { color: '#fff', fontWeight: '700', marginRight: 4 },
  vacio: { color: '#4b5563' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 },
  noLeida: { borderLeftWidth: 4, borderLeftColor: '#0033A0' },
  titulo: { fontWeight: '800', color: '#111827' },
  cuerpo: { color: '#374151' },
  meta: { color: '#6b7280', fontSize: 12 },
});
