import { initElsewhereApp } from './elsewhereApp';
import {startStoredApp} from './storageBoot';
import {installMobileViewport} from './mobileViewport';

const disposeViewport=installMobileViewport();
if(import.meta.hot)import.meta.hot.dispose(disposeViewport);
void startStoredApp(initElsewhereApp);
