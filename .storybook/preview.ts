import type { Preview } from "@storybook/react-vite";

import "../packages/input-bindings-react/src/styles.css";

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
    },
    layout: "fullscreen",
  },
};

export default preview;
