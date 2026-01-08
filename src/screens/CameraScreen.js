import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { RNCamera } from 'react-native-camera';

const CameraScreen = ({ navigation }) => {
    const stopCamera = () => {
        navigation.goBack();
    };

    return (
        <View style={styles.container}>
            <View style={styles.cameraContainer}>
                <RNCamera
                    style={styles.preview}
                    type={RNCamera.Constants.Type.front}
                    flashMode={RNCamera.Constants.FlashMode.on}
                    androidCameraPermissionOptions={{
                        title: 'Permission to use camera',
                        message: 'We need your permission to use your camera',
                        buttonPositive: 'Ok',
                        buttonNegative: 'Cancel',
                    }}
                />
                <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopCamera}>
                    <Text style={styles.buttonText}>Stop Camera</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    cameraContainer: {
        flex: 1,
        position: 'relative',
    },
    preview: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    button: {
        paddingHorizontal: 30,
        paddingVertical: 15,
        borderRadius: 8,
        elevation: 2,
    },
    stopButton: {
        backgroundColor: '#FF3B30',
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    },
});

export default CameraScreen;
