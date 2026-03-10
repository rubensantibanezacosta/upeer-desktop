import { useState, useEffect } from 'react';
import type { YggNetworkStatus } from '../components/ui/YggstackSplash.js';

export const useAppSetup = () => {
    // null = comprobando, false = no autenticado, true = autenticado
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    // Estado de la red Yggdrasil
    const [networkStatus, setNetworkStatus] = useState<YggNetworkStatus>('connecting');
    const [isFirstConnect, setIsFirstConnect] = useState(true);   // true hasta el primer 'up'
    const [yggAddress, setYggAddress] = useState<string | undefined>(undefined);

    useEffect(() => {
        // Consulta inmediata: sidecar ya en marcha (recarga del renderer)
        window.upeer.getMyNetworkAddress().then((addr: string) => {
            if (addr && addr !== 'No detectado') {
                setYggAddress(addr);
                setNetworkStatus('up');
                setIsFirstConnect(false);
            }
        });
        // Evento de dirección (primera detección de IPv6)
        window.upeer.onYggstackAddress((addr: string) => {
            setYggAddress(addr);
        });
        // Eventos de estado de red
        window.upeer.onYggstackStatus((status: string, addr?: string) => {
            const s = status as YggNetworkStatus;
            setNetworkStatus(s);
            if (s === 'up') {
                setIsFirstConnect(false);
                if (addr) setYggAddress(addr);
            }
        });
    }, []);

    // Comprobar sesión al arrancar: si el backend tiene la sesión auto-restaurada,
    // pasar directamente a la app sin mostrar la pantalla de login.
    useEffect(() => {
        window.upeer.identityStatus().then((status: any) => {
            if (!status.isLocked) {
                setIsAuthenticated(true);
            } else {
                setIsAuthenticated(false);
            }
        }).catch(() => {
            setIsAuthenticated(false);
        });
    }, []);

    return {
        isAuthenticated,
        setIsAuthenticated,
        networkStatus,
        setNetworkStatus,
        isFirstConnect,
        setIsFirstConnect,
        yggAddress,
        setYggAddress,
    };
};