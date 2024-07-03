/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect} from 'react';
import {
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {Colors} from 'react-native/Libraries/NewAppScreen';
import {BleManager, Device} from 'react-native-ble-plx';
import {Buffer} from 'buffer';

export const manager = new BleManager();

type State = {
  device: Device | null;
  rssi: number;
  count: number;
  message: string;
};
function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [state, setState] = React.useState({
    device: null,
    rssi: 0,
    count: 0,
    message: '',
  } as State);
  const requestBluetoothPermission = async () => {
    if (Platform.OS === 'ios') {
      return true;
    }
    if (
      Platform.OS === 'android' &&
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ) {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN &&
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          result['android.permission.BLUETOOTH_CONNECT'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.ACCESS_FINE_LOCATION'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }

    this.showErrorToast('Permission have not been granted');

    return false;
  };

  const doBluetoothThings = async (device: Device): Promise<void> => {
    setState(state => ({...state, message: 'Connecting...'}));
    await device.connect({
      autoConnect: true,
      requestMTU: 512,
    });
    setState(state => ({...state, message: 'Discovering services...'}));
    await device.discoverAllServicesAndCharacteristics();
    setState(state => ({...state, message: 'Reading RSSI...'}));
    await device.readRSSI();
    var rssi = device.rssi || 0;
    setState(state => ({...state, rssi}));
    setState(state => ({...state, message: 'Reading firmware version...'}));

    {
      const service = 'aa000000-2dd5-4887-8a05-d6655fdc7da9';
      const characteristic = 'aa000099-2dd5-4887-8a05-d66556278545';

      const char = await device.readCharacteristicForService(
        service,
        characteristic,
      );
      if (char.value) {
        const data = Uint8Array.from(Buffer.from(char.value, 'base64'));
        const firmwareVersion = new TextDecoder().decode(data);
        console.log(firmwareVersion);
      } else {
        console.log('No firmware version found');
      }
    }
    // await new Promise(resolve => setTimeout(resolve, 2000));
    {
      const service = '29a3f8fa-51aa-49a6-9b6b-d936795326ec';
      const characteristic = '5002';
      const payload = Buffer.from('0004D2000A02010203', 'base64');
      const payloadWithLen = new Uint8Array([payload.length, ...payload]);
      const portData = Buffer.from('14', 'base64');

      for (let i = 0; i < 10; i++) {
        console.log(`write ${i + 1}`);
        await device.writeCharacteristicWithResponseForService(
          service,
          characteristic,
          Buffer.from(payloadWithLen).toString('base64'),
        );

        await device.writeCharacteristicWithResponseForService(
          service,
          '5003',
          Buffer.from(portData).toString('base64'),
        );
      }
      console.log('done');
    }
    setState(state => ({...state, message: 'Disconnecting...'}));

    await device.cancelConnection();
  };

  useEffect(() => {
    const scanForDevices = async () => {
      try {
        await requestBluetoothPermission();
        await manager.startDeviceScan(null, null, (error, device) => {
          if (error) {
            console.error('Error scanning for devices:', error);
            return;
          }

          if (
            device !== null &&
            device.localName &&
            device.localName.startsWith('Taggr')
          ) {
            console.log('Found device:', device.localName);
            // Do something with the device
            setState(state => ({...state, device}));
            if (state.device?.id !== device.id) {
              (async () => {
                const sub = device.onDisconnected(() => {
                  console.log(device.localName, 'disconnected');
                });
                try {
                  await doBluetoothThings(device).catch(error => {
                    console.error(error);
                    device.cancelConnection();
                  });
                  // eslint-disable-next-line no-catch-shadow
                } catch (error) {
                  console.error('Error doing bluetooth things:', error);
                } finally {
                  device.cancelConnection();
                  sub.remove();
                }
              })();
            }
          }
        });
      } catch (error) {
        console.error('Error starting device scan:', error);
      }
    };

    scanForDevices();

    return () => {
      manager.stopDeviceScan();
    };
  }, []);
  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <View
          style={{
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
          }}>
          <Text>
            {state.device
              ? `Local Name: ${state.device.localName}`
              : 'searching...'}
          </Text>
          <Text>{state.device ? `RSSI: ${state.rssi}` : ''}</Text>
          <Text>{state.message}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
