import WidgetApp from "./components/WidgetApp"
import PanelApp from "./components/PanelApp"

function App() {
  const isPanel = window.location.hash === '#/panel';
  return isPanel ? <PanelApp /> : <WidgetApp />;
}

export default App
