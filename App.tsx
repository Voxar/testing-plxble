/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect} from 'react';
import retry from 'async-retry';
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
import {BleManager, Device, Subscription} from 'react-native-ble-plx';
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

    // this.showErrorToast('Permission have not been granted');

    return false;
  };

  const log = (text: string) => {
    setState(state => ({...state, message: text}));
    console.log(text);
  };

  const read = async (
    device: Device,
    service: string,
    characteristic: string,
  ): Promise<string> => {
    const char = await device.readCharacteristicForService(
      service,
      characteristic,
    );
    if (char.value) {
      const data = Uint8Array.from(Buffer.from(char.value, 'base64'));
      return new TextDecoder().decode(data);
    }
    throw new Error('No data found');
  };

  const write = async (
    device: Device,
    service: string,
    characteristic: string,
    data: Uint8Array,
  ): Promise<void> => {
    await device.writeCharacteristicWithResponseForService(
      service,
      characteristic,
      Buffer.from(data).toString('base64'),
    );
  };

  const doBluetoothThings = async (device: Device): Promise<void> => {
    var disconnectSub: Subscription | undefined;
    var connected = false;
    try {
      disconnectSub = device.onDisconnected(() => {
        log(`${device.localName} disconnected`);
      });
      log('Connecting...');
      await device.connect({
        requestMTU: 512,
      });
      connected = true;
      log('Discovering services...');
      await device.discoverAllServicesAndCharacteristics();

      log('Reading RSSI...');
      await device.readRSSI();
      var rssi = device.rssi || 0;
      setState(state => ({...state, rssi}));
      log(`RSSI: ${rssi}`);

      log('Reading firmware version...');
      const pcbName = await read(
        device,
        'aa000000-2dd5-4887-8a05-d6655fdc7da9',
        'aa000099-2dd5-4887-8a05-d66556278545',
      );
      log(`PCB Name: ${pcbName}`);

      log('Writing data...');
      const payload = Buffer.from('0004D2000A02010203', 'base64');
      const payloadWithLen = new Uint8Array([payload.length, ...payload]);
      const service = '29a3f8fa-51aa-49a6-9b6b-d936795326ec';
      await write(device, service, '5002', payloadWithLen);
      await write(device, service, '5003', Buffer.from('14', 'base64'));

      log('Writing data again...');
      await write(device, service, '5002', payloadWithLen);
      await write(device, service, '5003', Buffer.from('14', 'base64'));

      log('Disconnecting...');
      await manager.cancelDeviceConnection(device.id);
      connected = false;
      log('Done');
    } finally {
      disconnectSub?.remove();
      if (connected) {
        log('Finally disconnecting');
        await manager.cancelDeviceConnection(device.id).catch(_ => {});
      }
    }
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
                try {
                  await retry(
                    async () => {
                      await doBluetoothThings(device);
                    },
                    {
                      retries: 3,
                      onRetry: (error: any) => {
                        console.warn(`Try resulted in ${error}. Retrying...`);
                      },
                    },
                  );
                } catch (err) {
                  console.error(`Error doing bluetooth things: ${err}`);
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
