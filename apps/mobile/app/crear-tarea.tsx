import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { CATEGORIA, CATEGORIAS, PRIORIDAD, PRIORIDADES, COLOR_PRIORIDAD } from '../lib/etiquetas';

const GESTION = ['admin', 'coordinador', 'lider_grupo'];

export default function CrearTarea() {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('media');
  const [categoria, setCategoria] = useState('general');
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
      setPermitido(!!data && GESTION.includes((data as any).rol));
    })();
  }, []);

  async function crear() {
    if (!titulo.trim()) { Alert.alert('Falta el título'); return; }
    setEnviando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('tareas').insert({
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      estado: 'pendiente', prioridad, categoria, creado_por: user!.id,
    });
    setEnviando(false);
    if (error) { Alert.alert('No se pudo crear', error.message); return; }
    router.replace('/tareas');
  }

  if (permitido === null) return <View style={s.centro}><ActivityIndicator size="large" color="#0033A0" /></View>;
  if (!permitido) return (
    <View style={s.centro}>
      <Stack.Screen options={{ title: 'Crear tarea' }} />
      <Text style={s.vacio}>Solo coordinación o líderes de grupo pueden crear tareas.</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Crear tarea' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <TextInput style={s.input} placeholder="Título" value={titulo} onChangeText={setTitulo} />
        <TextInput style={[s.input, s.multi]} placeholder="Descripción (opcional)" multiline value={descripcion} onChangeText={setDescripcion} />

        <Text style={s.label}>Prioridad</Text>
        <View style={s.chips}>
          {PRIORIDADES.map((p) => (
            <Pressable key={p} onPress={() => setPrioridad(p)}
              style={[s.chip, prioridad === p && { backgroundColor: COLOR_PRIORIDAD[p], borderColor: COLOR_PRIORIDAD[p] }]}>
              <Text style={[s.chipTxt, prioridad === p && { color: '#fff' }]}>{PRIORIDAD[p]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>Categoría</Text>
        <View style={s.chips}>
          {CATEGORIAS.map((c) => (
            <Pressable key={c} onPress={() => setCategoria(c)}
              style={[s.chip, categoria === c && s.chipOn]}>
              <Text style={[s.chipTxt, categoria === c && { color: '#fff' }]}>{CATEGORIA[c]}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[s.btn, enviando && { opacity: 0.6 }]} onPress={crear} disabled={enviando}>
          <Text style={s.btnTxt}>{enviando ? 'Creando…' : 'Crear tarea'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacio: { color: '#4b5563', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  multi: { minHeight: 90, textAlignVertical: 'top' },
  label: { fontWeight: '800', color: '#111827', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#0033A0', borderColor: '#0033A0' },
  chipTxt: { color: '#111827', fontWeight: '600' },
  btn: { backgroundColor: '#0033A0', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
