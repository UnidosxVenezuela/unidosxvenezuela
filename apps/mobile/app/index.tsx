import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Si ya hay sesión, ir directo a Mis tareas.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.replace('/panel'); });
  }, []);

  async function entrar() {
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setError(error.message);
    router.replace('/panel');
  }

  return (
    <View style={s.c}>
      <View style={s.marca}>
        <View style={s.punto} />
        <Text style={s.titulo}>UnidosXVenezuela</Text>
      </View>
      <Text style={s.sub}>Coordinación de respuesta — Venezuela</Text>

      <TextInput style={s.input} placeholder="Correo" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Contraseña" secureTextEntry
        value={password} onChangeText={setPassword} />

      <Pressable style={[s.btn, cargando && { opacity: 0.6 }]} onPress={entrar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Entrar</Text>}
      </Pressable>

      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  marca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  punto: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFCE00' },
  titulo: { fontSize: 30, fontWeight: '800', color: '#0033A0' },
  sub: { textAlign: 'center', color: '#4b5563', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#fff' },
  btn: { backgroundColor: '#0033A0', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 4 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#CF142B', fontWeight: '600', textAlign: 'center' },
});
