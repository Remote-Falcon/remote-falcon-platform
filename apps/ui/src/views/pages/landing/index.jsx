import { Box } from '@mui/material';

import AppBar from '../../../ui-component/extended/AppBar';

import Feature from './Feature';
import Footer from './Footer';
import Header from './Header';

const Landing = () => (
  <Box id="home" sx={{ overflowX: 'hidden' }}>
    <AppBar />
    <Header />
    <Feature />
    <Footer />
  </Box>
);

export default Landing;
