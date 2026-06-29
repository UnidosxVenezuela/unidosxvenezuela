import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { URGENCIA, COLOR_URGENCIA } from '../lib/etiquetas';

type Punto = {
  id: string; nombre: string; direccion: string | null; necesita: string | null;
  capacidad: string | null; telefono: string | null; urgencia: string; lat: number; lng: number;
};
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export default function Acopio() {
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data } = await supabase.from('puntos_acopio')
      .select('id, nombre, direccion, necesita, capacidad, telefono, urgencia, lat, lng')
      .eq('activo', true);
    const items = ((data ?? []) as Punto[]).sort((a, b) => (ORDEN[a.urgencia] ?? 1) - (ORDEN[b.urgencia] ?? 1));
    setPuntos(items);
    setCargando(false); setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirMapa(p: Punto) {
    const url = Platform.select({
      ios: `https://maps.apple.com/?q=${p.lat},${p.lng}`,
      default: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`,
    })!;
    Linking.openURL(url);
  }

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Centros de acopio' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        {puntos.length === 0 && <Text style={s.vacio}>No hay centros de acopio activos.</Text>}
        {puntos.map((p) => (
          <View key={p.id} style={s.tarjeta}>
            <View style={s.fila}>
              <Text style={s.titulo}>{p.nombre}</Text>
              <Text style={[s.badge, { backgroundColor: COLOR_URGENCIA[p.urgencia] ?? '#475569' }]}>{URGENCIA[p.urgencia] ?? p.urgencia}</Text>
            </View>
            {!!p.direccion && <Text style={s.linea}>📍 {p.direccion}</Text>}
            {!!p.necesita && <Text style={s.linea}>🆘 Necesita: {p.necesita}</Text>}
            {!!p.capacidad && <Text style={s.linea}>📦 {p.capacidad}</Text>}
            <View style={s.acciones}>
              <Pressable style={s.btn} onPress={() => abrirMapa(p)}><Text style={s.btnTxt}>Abrir en Maps</Text></Pressable>
              {!!p.telefono && (
                <Pressable style={[s.btn, s.btnTel]} onPress={() => Linking.openURL(`tel:${p.telefono}`)}>
                  <Text style={s.btnTxt}>Llamar</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vacio: { color: '#4b5563' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  badge: { color: '#fff', fontWeight: '800', fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  linea: { color: '#374151' },
  acciones: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { backgroundColor: '#0033A0', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  btnTel: { backgroundColor: '#16a34a' },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
