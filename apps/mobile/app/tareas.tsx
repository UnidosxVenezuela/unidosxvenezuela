import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

const ESTADO: Record<string, string> = {
  pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En progreso',
  bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada',
};
const PRIORIDAD: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
const COLOR_PRIORIDAD: Record<string, string> = { baja: '#475569', media: '#a16207', alta: '#c2410c', critica: '#CF142B' };

type Tarea = { id: string; titulo: string; estado: string; prioridad: string; vence_en: string | null };

export default function MisTareas() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data } = await supabase.from('tareas')
      .select('id, titulo, estado, prioridad, vence_en')
      .eq('asignado_a', user.id)
      .order('creado_en', { ascending: false });
    setTareas((data ?? []) as Tarea[]);
    setCargando(false);
    setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{
        title: 'Mis tareas',
        headerRight: () => <Pressable onPress={salir}><Text style={s.salir}>Salir</Text></Pressable>,
      }} />

      {tareas.length === 0 ? (
        <View style={s.centro}>
          <Text style={s.vacioTitulo}>En espera de tareas</Text>
          <Text style={s.vacioTexto}>Aún no tienes tareas asignadas. La coordinación te asignará tareas pronto.</Text>
        </View>
      ) : (
        <FlatList
          data={tareas}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
          renderItem={({ item }) => (
            <View style={s.tarjeta}>
              <Text style={s.tareaTitulo}>{item.titulo}</Text>
              <View style={s.fila}>
                <Text style={[s.pill, { color: COLOR_PRIORIDAD[item.prioridad] ?? '#475569' }]}>
                  {PRIORIDAD[item.prioridad] ?? item.prioridad}
                </Text>
                <Text style={s.estado}>{ESTADO[item.estado] ?? item.estado}</Text>
              </View>
              {item.vence_en && (
                <Text style={s.vence}>Vence: {new Date(item.vence_en).toLocaleString('es-VE')}</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  salir: { color: '#fff', fontWeight: '700', marginRight: 4 },
  vacioTitulo: { fontSize: 20, fontWeight: '800', color: '#0033A0' },
  vacioTexto: { color: '#4b5563', textAlign: 'center' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  tareaTitulo: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { fontWeight: '800', fontSize: 13 },
  estado: { color: '#4b5563', fontSize: 13 },
  vence: { color: '#4b5563', fontSize: 12, marginTop: 6 },
});
