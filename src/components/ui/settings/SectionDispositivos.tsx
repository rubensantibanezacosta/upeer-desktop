import React, { useCallback, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { DeviceEnrollmentPanel } from './DeviceEnrollmentPanel.js';
import { AuthorizedDeviceList } from './AuthorizedDeviceList.js';
import { DeviceSessionList } from './DeviceSessionList.js';
import { SettingsCard, SettingsSection } from './sectionShell.js';

export const SectionDispositivos: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

    return (
        <SettingsSection
            icon={<MonitorSmartphone style={{ fontSize: 18 }} />}
            title="Dispositivos"
            description="Los equipos vinculados comparten la misma cuenta, los mismos contactos y las mismas conversaciones. Ninguno recibe la frase semilla: cada uno guarda un certificado firmado por la cuenta."
        >
            <SettingsCard>
                <DeviceEnrollmentPanel onEnrolled={refresh} />
            </SettingsCard>
            <SettingsCard>
                <AuthorizedDeviceList key={`devices-${refreshKey}`} />
            </SettingsCard>
            <SettingsCard>
                <DeviceSessionList />
            </SettingsCard>
        </SettingsSection>
    );
};
