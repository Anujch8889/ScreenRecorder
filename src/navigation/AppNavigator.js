import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ROUTES } from '../constants/Routes';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    return (
        <Stack.Navigator initialRouteName={ROUTES.HOME}>
            <Stack.Screen
                name={ROUTES.HOME}
                component={HomeScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name={ROUTES.CAMERA}
                component={CameraScreen}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;
