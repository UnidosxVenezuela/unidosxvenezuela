import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

type Grupo = { id: string; nombre: string; area: string; descripcion: string | null; whatsapp: string | null };

export default function Grupos() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [fijados, setFijados] = useState<Record<string, { id: string; contenido: string }[]>>({});
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const [g, a, c, f] = await Promise.all([
      supabase.from('grupos').select('id, nombre, area, descripcion, whatsapp').order('nombre'),
      supabase.from('areas').select('clave, nombre'),
      supabase.rpc('conteo_miembros_grupo'),
      supabase.from('mensajes_fijados').select('id, grupo_id, contenido').order('creado_en', { ascending: false }),
    ]);
    setGrupos((g.data ?? []) as Grupo[]);
    setAreas(Object.fromEntries((a.data ?? []).map((x: any) => [x.clave, x.nombre])));
    setConteo(Object.fromEntries((c.data ?? []).map((x: any) => [x.grupo_id, x.total])));
    const map: Record<string, { id: string; contenido: string }[]> = {};
    for (const m of (f.data ?? []) as any[]) (map[m.grupo_id] ||= []).push({ id: m.id, contenido: m.contenido });
    setFijados(map);
    setCargando(false); setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Grupos' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        {grupos.length === 0 && <Text style={s.vacio}>No hay grupos todavía.</Text>}
        {grupos.map((g) => (
          <View key={g.id} style={s.tarjeta}>
            <View style={s.fila}>
              <Text style={s.titulo}>{g.nombre}</Text>
              <Text style={s.badge}>{areas[g.area] ?? g.area}</Text>
            </View>
            {!!g.descripcion && <Text style={s.desc}>{g.descripcion}</Text>}
            <Text style={s.meta}>{conteo[g.id] ?? 0} miembros</Text>
            {(fijados[g.id] ?? []).map((m) => (
              <View key={m.id} style={s.fijado}><Text style={s.fijadoTxt}>📌 {m.contenido}</Text></View>
            ))}
            {!!g.whatsapp && (
              <Pressable style={s.btnWa} onPress={() => Linking.openURL(g.whatsapp!)}>
                <Text style={s.btnWaTxt}>WhatsApp del grupo</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vacio: { color: '#4b5563' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  badge: { backgroundColor: '#e5e7eb', color: '#111827', fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  desc: { color: '#4b5563' },
  meta: { color: '#4b5563', fontSize: 13 },
  fijado: { backgroundColor: '#fffbea', borderLeftWidth: 4, borderLeftColor: '#FFCE00', borderRadius: 8, padding: 10 },
  fijadoTxt: { color: '#1f2937' },
  btnWa: { backgroundColor: '#25D366', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnWaTxt: { color: '#fff', fontWeight: '800' },
});
