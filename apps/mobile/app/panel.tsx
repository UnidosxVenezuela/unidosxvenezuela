import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';

const GESTION = ['admin', 'coordinador', 'lider_grupo'];

export default function Panel() {
  const [perfil, setPerfil] = useState<{ nombre_completo: string; rol: string } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data } = await supabase.from('perfiles')
        .select('nombre_completo, rol').eq('id', user.id).single();
      setPerfil(data as any);
      setCargando(false);
    })();
  }, []);

  async function salir() { await supabase.auth.signOut(); router.replace('/'); }

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;

  const gestiona = !!perfil && GESTION.includes(perfil.rol);
  const items = [
    { t: 'Mis tareas', e: '✅', r: '/tareas' },
    ...(gestiona ? [{ t: 'Crear tarea', e: '➕', r: '/crear-tarea' }] : []),
    { t: 'Grupos', e: '👥', r: '/grupos' },
    { t: 'Tablón', e: '📣', r: '/tablon' },
    { t: 'Centros de acopio', e: '📦', r: '/acopio' },
    { t: 'Mis horas', e: '⏱️', r: '/horas' },
    { t: 'Avisos', e: '🔔', r: '/avisos' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Panel', headerRight: () => <Pressable onPress={salir}><Text style={s.salir}>Salir</Text></Pressable> }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.hola}>Hola, {perfil?.nombre_completo?.split(' ')[0] || ''} 👋</Text>
        <Text style={s.sub}>¿En qué colaboramos hoy?</Text>
        <View style={s.grid}>
          {items.map((i) => (
            <Pressable key={i.r} style={s.card} onPress={() => router.push(i.r as any)}>
              <Text style={s.emoji}>{i.e}</Text>
              <Text style={s.cardTxt}>{i.t}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  salir: { color: '#fff', fontWeight: '700', marginRight: 4 },
  hola: { fontSize: 24, fontWeight: '800', color: '#111827' },
  sub: { color: '#4b5563', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 30 },
  cardTxt: { fontWeight: '700', color: '#111827', textAlign: 'center' },
});
