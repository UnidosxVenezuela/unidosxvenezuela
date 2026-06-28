import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

const ESTADO: Record<string, string> = {
  pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En progreso',
  bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada',
};
const PRIORIDAD: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
const CATEGORIA: Record<string, string> = {
  codigo: 'Código', diseno: 'Diseño', marketing: 'Marketing', redes_sociales: 'Redes',
  transcripcion: 'Transcripción', legal: 'Legal', acopio: 'Acopio', logistica: 'Logística',
  datos: 'Datos', salud: 'Salud', traduccion: 'Traducción', comunicaciones: 'Comunicaciones', general: 'General',
};
const COLOR_PRIORIDAD: Record<string, string> = { baja: '#475569', media: '#a16207', alta: '#c2410c', critica: '#CF142B' };

type Tarea = { id: string; titulo: string; estado: string; prioridad: string; categoria: string; vence_en: string | null };

export default function MisTareas() {
  const [mias, setMias] = useState<Tarea[]>([]);
  const [abiertas, setAbiertas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const cols = 'id, titulo, estado, prioridad, categoria, vence_en';
    const [mine, open] = await Promise.all([
      supabase.from('tareas').select(cols).eq('asignado_a', user.id).order('creado_en', { ascending: false }),
      supabase.from('tareas').select(cols).is('asignado_a', null).eq('estado', 'pendiente').order('creado_en', { ascending: false }),
    ]);
    setMias((mine.data ?? []) as Tarea[]);
    setAbiertas((open.data ?? []) as Tarea[]);
    setCargando(false);
    setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function tomar(id: string) {
    const { error } = await supabase.rpc('tomar_tarea', { p_tarea: id });
    if (error) { Alert.alert('No se pudo tomar', error.message); return; }
    cargar();
  }

  async function salir() { await supabase.auth.signOut(); router.replace('/'); }

  if (cargando) {
    return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{
        title: 'Tareas',
        headerRight: () => <Pressable onPress={salir}><Text style={s.salir}>Salir</Text></Pressable>,
      }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}
      >
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={s.h2}>Tareas abiertas</Text>
            {abiertas.length === 0
              ? <Text style={s.vacioTexto}>No hay tareas abiertas ahora.</Text>
              : abiertas.map((t) => (
                <View key={t.id} style={s.tarjeta}>
                  <Text style={s.badge}>{CATEGORIA[t.categoria] ?? t.categoria}</Text>
                  <Text style={s.tareaTitulo}>{t.titulo}</Text>
                  <Pressable style={s.btnAcento} onPress={() => tomar(t.id)}>
                    <Text style={s.btnAcentoTxt}>Tomar tarea</Text>
                  </Pressable>
                </View>
              ))}

            <Text style={s.h2}>Mis tareas</Text>
            {mias.length === 0
              ? <Text style={s.vacioTexto}>Aún no tienes tareas. Toma una de arriba o espera asignación.</Text>
              : mias.map((t) => (
                <View key={t.id} style={s.tarjeta}>
                  <View style={s.fila}>
                    <Text style={[s.pill, { color: COLOR_PRIORIDAD[t.prioridad] ?? '#475569' }]}>{PRIORIDAD[t.prioridad] ?? t.prioridad}</Text>
                    <Text style={s.estado}>{ESTADO[t.estado] ?? t.estado}</Text>
                  </View>
                  <Text style={s.tareaTitulo}>{t.titulo}</Text>
                  {t.vence_en && <Text style={s.vence}>Vence: {new Date(t.vence_en).toLocaleString('es-VE')}</Text>}
                </View>
              ))}
          </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  salir: { color: '#fff', fontWeight: '700', marginRight: 4 },
  h2: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 8 },
  vacioTexto: { color: '#4b5563' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#e5e7eb', color: '#111827', fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  tareaTitulo: { fontSize: 16, fontWeight: '700', color: '#111827' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { fontWeight: '800', fontSize: 13 },
  estado: { color: '#4b5563', fontSize: 13 },
  vence: { color: '#4b5563', fontSize: 12 },
  btnAcento: { backgroundColor: '#FFCE00', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnAcentoTxt: { color: '#002270', fontWeight: '800' },
});
