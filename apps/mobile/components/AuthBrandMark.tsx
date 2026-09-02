import { Image, StyleSheet, View } from 'react-native';

type AuthBrandMarkProps = {
  size?: number;
};

export default function AuthBrandMark({ size = 88 }: AuthBrandMarkProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require('../assets/images/icon.png')}
        style={{ width: size * 0.78, height: size * 0.78, borderRadius: size * 0.2 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.2)',
    shadowColor: '#E85D75',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
});
