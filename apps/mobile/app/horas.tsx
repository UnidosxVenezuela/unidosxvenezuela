import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { formatoHoras } from '../lib/etiquetas';

type Registro = { id: string; horas: number; descripcion: string | null; fecha: string };

export default function Horas() {
  const [items, setItems] = useState<Registro[]>([]);
  const [totalComunidad, setTotalComunidad] = useState(0);
  const [horas, setHoras] = useState('');
  const [desc, setDesc] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const [reg, total] = await Promise.all([
      supabase.from('registro_horas').select('id, horas, descripcion, fecha')
        .eq('perfil_id', user.id).order('fecha', { ascending: false }).limit(100),
      supabase.rpc('total_horas_comunidad'),
    ]);
    setItems((reg.data ?? []) as Registro[]);
    setTotalComunidad(Number(total.data ?? 0));
    setCargando(false); setRefrescando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function registrar() {
    const n = Number(horas.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 24) { Alert.alert('Horas inválidas', 'Indica un número entre 0 y 24.'); return; }
    setEnviando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('registro_horas')
      .insert({ perfil_id: user!.id, horas: n, descripcion: desc.trim() || null });
    setEnviando(false);
    if (error) { Alert.alert('No se pudo registrar', error.message); return; }
    setHoras(''); setDesc('');
    cargar();
  }

  if (cargando) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;
  const misHoras = items.reduce((acc, r) => acc + Number(r.horas), 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Mis horas' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} />}>
        <View style={s.cifras}>
          <View style={s.cifra}><Text style={s.cifraLabel}>Tus horas</Text><Text style={s.cifraNum}>{formatoHoras(misHoras)}</Text></View>
          <View style={s.cifra}><Text style={s.cifraLabel}>Juntos llevamos</Text><Text style={[s.cifraNum, { color: '#0033A0' }]}>{formatoHoras(totalComunidad)}</Text></View>
        </View>

        <View style={s.tarjeta}>
          <Text style={s.h2}>Registrar horas</Text>
          <TextInput style={s.input} placeholder="Horas (ej. 2.5)" keyboardType="numeric" value={horas} onChangeText={setHoras} />
          <TextInput style={s.input} placeholder="¿En qué colaboraste?" value={desc} onChangeText={setDesc} />
          <Pressable style={[s.btn, enviando && { opacity: 0.6 }]} onPress={registrar} disabled={enviando}>
            <Text style={s.btnTxt}>{enviando ? 'Guardando…' : 'Registrar'}</Text>
          </Pressable>
        </View>

        <Text style={s.h2}>Historial</Text>
        {items.length === 0 && <Text style={s.vacio}>Aún no registraste horas.</Text>}
        {items.map((r) => (
          <View key={r.id} style={s.tarjeta}>
            <Text style={s.regHoras}>{formatoHoras(Number(r.horas))}</Text>
            <Text style={s.meta}>{new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-VE')} · {r.descripcion || '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vacio: { color: '#4b5563' },
  cifras: { flexDirection: 'row', gap: 12 },
  cifra: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cifraLabel: { color: '#6b7280', fontSize: 13 },
  cifraNum: { fontSize: 28, fontWeight: '800', color: '#111827' },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  h2: { fontSize: 18, fontWeight: '800', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: '#0033A0', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800' },
  regHoras: { fontWeight: '800', color: '#111827', fontSize: 16 },
  meta: { color: '#4b5563', fontSize: 13 },
});
