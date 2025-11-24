import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import ResourceListScreen from "./src/screens/ResourceListScreen";
import AddResourceScreen from "./src/screens/AddResourceScreen";

export type RootStackParamList = {
  Login: undefined;
  Resources: undefined;
  AddResource: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator>
      {!token ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Login" }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Resources"
            component={ResourceListScreen}
            options={{ title: "My Resources" }}
          />
          <Stack.Screen
            name="AddResource"
            component={AddResourceScreen}
            options={{ title: "Add Resource" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
