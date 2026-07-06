import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Setting2 } from 'iconsax-react';

const html = ReactDOMServer.renderToStaticMarkup(
  React.createElement(Setting2, { className: 'h-7 w-7 text-primary' })
);
console.log("HTML Output:", html);
