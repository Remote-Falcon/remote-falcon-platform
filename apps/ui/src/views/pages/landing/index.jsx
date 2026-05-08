import { Box } from '@mui/material';

import AppBar from '../../../ui-component/extended/AppBar';

import Feature from './Feature';
import Footer from './Footer';
import Header from './Header';

// NB: do NOT wrap this tree in a node with overflow-x: hidden (or any
// overflow != visible). The AppBar inside uses position: sticky and an
// overflow-clipped ancestor turns itself into the sticky scroll context,
// killing the stick. Header self-clips its decorative orb already.
const Landing = () => (
  <Box id="home">
    <AppBar />
    <Header />
    <Feature />
    <Footer />
  </Box>
);

export default Landing;
