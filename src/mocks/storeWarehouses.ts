/**
 * Power Mac Center stores as warehouses (ST-001…), from the official store list at
 * https://powermaccenter.com/pages/store-list (October 2026). Robinsons Galleria Cebu and
 * Abreeza are WH-CEB and WH-DVO, so they're not repeated here.
 *
 * City and province are matched to PSGC from the address text. The barangay comes from the
 * address when it names one (matched to its PSGC spelling); otherwise, where the mall's
 * location is well known, it's inferred and the row says so. Every barangay is checked against
 * src/data/psgc. A few stay blank where the mall sits between barangays (the Tagaytay Rotonda,
 * Marasbaras in Tacloban) or isn't certain. ZIP is the address's when it gives one, else
 * PHLPost's code for the city (Metro Manila: for the mall's district). SM San Lazaro's is left
 * blank; it sits on the line between two Santa Cruz ZIPs.
 */
import { blankPostalAddress } from './address';
import type { Warehouse } from './itemMasters';

type Row = [code: string, name: string, addressLine: string, barangay: string, city: string, zip: string,
  province: string, provinceCode: string, cityCode: string, barangayCode: string];

const ROWS: Row[] = [
  // ── Metro Manila ──────────────────────────────────────────────────────────
  ['ST-001', 'Greenbelt 3', '2/F, Greenbelt 3, Greenbelt Complex, Ayala Center', 'San Lorenzo', 'City of Makati', '1223', 'Metro Manila', '1300', '137602', '137602025'], // barangay inferred from the mall's location
  ['ST-002', 'The Annex at SM North EDSA', '4F Annex I Bldg., SM City North Edsa, Brgy. Sto Cristo', 'Santo Cristo', 'Quezon City', '1105', 'Metro Manila', '1300', '137404', '137404108'],
  ['ST-003', 'Ayala Malls TriNoma', 'Level 3, Trinoma Mall cor. North Ave., Brgy. Bagong Pag-Asa', 'Bagong Pag-asa', 'Quezon City', '1105', 'Metro Manila', '1300', '137404', '137404009'],
  ['ST-004', 'Robinsons Magnolia', 'Level 2, Robinsons Magnolia (Expansion Bldg.), Aurora Blvd. cor. Doña Hemady, New Manila', 'Kaunlaran', 'Quezon City', '1111', 'Metro Manila', '1300', '137404', '137404050'], // barangay inferred from the mall's location
  ['ST-005', 'SM Megamall', 'Level 4, Cyberzone, Building B, SM Megamall J. Vargas cor. EDSA Wack Wack Village', 'Wack-wack Greenhills', 'City of Mandaluyong', '1550', 'Metro Manila', '1300', '137401', '137401027'],
  ['ST-006', 'Power Plant Mall', 'R2 Level, Power Plant Mall, Rockwell Center Poblacion', 'Poblacion', 'City of Makati', '1210', 'Metro Manila', '1300', '137602', '137602020'],
  ['ST-007', 'SM Mall of Asia', '2/F North Parking Bldg., Seaside, SM Mall of Asia', 'Barangay 76', 'Pasay City', '1300', 'Metro Manila', '1300', '137605', '137605076'], // barangay inferred from the mall's location
  ['ST-008', 'Festival Mall', 'Upper Ground Level, Festival Supermall, Alabang', 'Alabang', 'City of Muntinlupa', '1781', 'Metro Manila', '1300', '137603', '137603001'],
  ['ST-009', 'SM City Fairview', '3F Cyberzone SM City Fairview, Quirino Highway cor. Regalado Ave., Brgy. Greater Lagro, Novaliches', 'Greater Lagro', 'Quezon City', '1118', 'Metro Manila', '1300', '137404', '137404141'],
  ['ST-010', 'SM City Novaliches', 'Second Floor, SM City Novaliches, Quirino Hwy, Novaliches', '', 'Quezon City', '1116', 'Metro Manila', '1300', '137404', ''],
  ['ST-011', 'SM City Caloocan', '3rd Floor, Cyberzone, SM City Caloocan, Deparo Road, Brgy. 171, Zone 15, District 1 Bagumbong', 'Barangay 171', 'City of Caloocan', '1400', 'Metro Manila', '1300', '137501', '137501171'],
  ['ST-012', 'SM City Grand Central', '4/F, Cyberzone, SM City Grand Central, Rizal Ave. Ext., East Grace Park', '', 'City of Caloocan', '1400', 'Metro Manila', '1300', '137501', ''],
  ['ST-013', 'Ayala Malls Cloverleaf', 'Ground Floor, Cloverleaf Mall, A. Bonifacio Ave. Brgy Balingasa', 'Balingasa', 'Quezon City', '1115', 'Metro Manila', '1300', '137404', '137404013'],
  ['ST-014', 'Ayala Malls Vertis North', 'Level 2 Ayala Malls Vertis, Edsa Cor. North Ave., Bagong Pag-Asa', 'Bagong Pag-asa', 'Quezon City', '1105', 'Metro Manila', '1300', '137404', '137404009'],
  ['ST-015', 'Northeast Square', '2nd Floor Unit SO5 Northeast Square No. 74 Connecticut St., Greenhills', 'Greenhills', 'City of San Juan', '1502', 'Metro Manila', '1300', '137405', '137405021'],
  ['ST-016', 'SM City San Lazaro', '3rd Level, Felix Huertas cor. A.H. Lacson St.', '', 'City of Manila', '', 'Metro Manila', '1300', '133900', ''],
  ['ST-017', 'SM City Sta. Mesa', 'Level 3 Cyberzone SM City Sta. Mesa Magsaysay Blvd. Cor. Gregorio Araneta Ave. Doña Imelda District 4', 'Doña Imelda', 'Quezon City', '1113', 'Metro Manila', '1300', '137404', '137404031'],
  ['ST-018', 'De La Salle University (Taft)', 'Taft Ave, Malate', '', 'City of Manila', '1004', 'Metro Manila', '1300', '133900', ''],
  ['ST-019', 'University of Santo Tomas', '2/F Multi Deck Parking UST Campus España Blvd Zone 046 Brgy 470 Sampaloc', 'Barangay 470', 'City of Manila', '1008', 'Metro Manila', '1300', '133900', '133906076'],
  ['ST-020', 'Ongpin', 'Neo Plaza Building, Ongpin St. cor. Sabino Padilla St., Binondo', '', 'City of Manila', '1006', 'Metro Manila', '1300', '133900', ''],
  ['ST-021', 'SM City Masinag', '2nd Floor, Cyberzone, SM City Masinag, Infanta Hwy, Masinag', 'Mayamot', 'City of Antipolo', '1870', 'Rizal', '0458', '045802', '045802004'], // barangay inferred from the mall's location
  ['ST-022', 'SM City East Ortigas', '2nd Floor, SM City East Ortigas, Ortigas Ave. Ext. Sta Lucia', 'Santa Lucia', 'City of Pasig', '1608', 'Metro Manila', '1300', '137403', '137403030'],
  ['ST-023', 'SM City Marikina', '3rd Level, Cyberzone, SM City Marikina, Marikina-Infanta Hwy', 'Calumpang', 'City of Marikina', '1801', 'Metro Manila', '1300', '137402', '137402002'], // barangay inferred from the mall's location
  ['ST-024', 'Eastwood Mall', 'G/F & B1, 1880 Building, Eastwood City, Bagumbayan', 'Bagumbayan', 'Quezon City', '1110', 'Metro Manila', '1300', '137404', '137404011'],
  ['ST-025', 'SM Podium', '3rd Level, Expansion Wing, SM Podium, ADB Ave. Brgy. Wack-Wack Greenhills east, Ortigas Center', 'Wack-wack Greenhills', 'City of Mandaluyong', '1550', 'Metro Manila', '1300', '137401', '137401027'],
  ['ST-026', 'Shangri-La Plaza', 'Mid Level 2/3 East Wing, Shangri-La Plaza, EDSA corner Shaw Boulevard', 'Wack-wack Greenhills', 'City of Mandaluyong', '1550', 'Metro Manila', '1300', '137401', '137401027'], // barangay inferred from the mall's location
  ['ST-027', 'Estancia Mall', 'L1, Estancia, Captiol Commons, 1605 Meralco Ave, Ortigas Center', 'Oranbo', 'City of Pasig', '1605', 'Metro Manila', '1300', '137403', '137403013'], // barangay inferred from the mall's location
  ['ST-028', 'Park Triangle Mall', 'Ground Floor, Park Triangle Mall, 32nd Street cor., 11th Avenue, Brgy. Fort Bonifacio, Bonifacio', 'Fort Bonifacio', 'City of Taguig', '1634', 'Metro Manila', '1300', '137607', '137607020'],
  ['ST-029', 'SM Aura Premier', 'Level 2, SM Aura Premier, 26th St. cor. McKinley Parkway, Brgy. Fort Bonifacio', 'Fort Bonifacio', 'City of Taguig', '1630', 'Metro Manila', '1300', '137607', '137607020'],
  ['ST-030', 'Vista Mall Taguig', '2/F Vista Mall Taguig, Vista Mall, 1637 Camella Taguig Rd, Brgy. Tuktukan', 'Tuktukan', 'City of Taguig', '1637', 'Metro Manila', '1300', '137607', '137607014'],
  ['ST-031', 'Glorietta 5', '3/F Glorietta 5 Ayala Center', 'San Lorenzo', 'City of Makati', '1224', 'Metro Manila', '1300', '137602', '137602025'], // barangay inferred from the mall's location
  ['ST-032', 'Circuit Lane', 'Ground Floor, Circuit Lane, Brgy Carmona, Circuit', 'Carmona', 'City of Makati', '1207', 'Metro Manila', '1300', '137602', '137602005'],
  ['ST-033', 'Cash & Carry', '2nd Floor Cash & Carry Emilia Street Brgy Palanan', 'Palanan', 'City of Makati', '1235', 'Metro Manila', '1300', '137602', '137602015'],
  ['ST-034', 'SM City Bicutan', '2nd Floor, Cyberzone, Building C, SM City Bicutan, 1700 Doña Soledad Avenue, corner South Luzon Expressway', 'Don Bosco', 'City of Parañaque', '1709', 'Metro Manila', '1300', '137604', '137604008'], // barangay inferred from the mall's location
  ['ST-035', 'SM City BF Parañaque', '3rd Floor, Cyberzone, SM City BF Parañaque Dr. A Santos Ave. Brgy. BF Homes', 'B. F. Homes', 'City of Parañaque', '1720', 'Metro Manila', '1300', '137604', '137604007'],
  ['ST-036', 'SM Southmall', '3/F Cyberzone SM South Mall Alabang Zapote Rd.', 'Almanza Uno', 'City of Las Piñas', '1750', 'Metro Manila', '1300', '137601', '137601001'], // barangay inferred from the mall's location
  ['ST-037', 'UP Shopping Center', 'G/F West Building, UP Shopping Center, UP Diliman Campus', 'U.P. Campus', 'Quezon City', '1101', 'Metro Manila', '1300', '137404', '137404124'],
  ['ST-038', 'SM Taytay', '2nd Level Bldg. B., Cyberzone, SM City', 'Dolores', 'Taytay', '1920', 'Rizal', '0458', '045813', '045813001'], // barangay inferred from the mall's location
  ['ST-039', 'Sta. Lucia', 'Ground Level Bldg. 3 Sta. Lucia Mall 3 Marikina Infanta Highway San Isidro', 'San Isidro', 'Cainta', '1900', 'Rizal', '0458', '045805', '045805015'],
  ['ST-040', 'Angono (Pop-Up)', '2/F SM Center Angono Manila East Road cor M.L Quezon St. San Isidro Angono Rizal', 'San Isidro', 'Angono', '1930', 'Rizal', '0458', '045801', '045801009'],
  ['ST-041', 'Ayala Malls Manila Bay', '4L, Ayala Malls Manila Bay, Entertainment City, Diosdado Macapagal Blvd', 'Tambo', 'City of Parañaque', '1701', 'Metro Manila', '1300', '137604', '137604006'], // barangay inferred from the mall's location
  ['ST-042', 'SM City Sucat', 'Level 2, Building A, Cyberzone, SM City Sucat, Doctor Arcadio Santos Avenue, corner Carlos P. Garcia Ave Ext', 'San Dionisio', 'City of Parañaque', '1700', 'Metro Manila', '1300', '137604', '137604004'], // barangay inferred from the mall's location
  ['ST-043', 'Bonifacio High Street', '1F, Wumaco Building, 7th Ave cor. Lane P, High Street, Post Proper Northside', 'Fort Bonifacio', 'City of Taguig', '1635', 'Metro Manila', '1300', '137607', '137607020'],
  ['ST-044', 'SM City Manila', 'Unit No. CZ002, Lower Ground Level, Cyberzone, SM City Manila, Natividad Almeda-Lopez corner A. Villegas and San Marcelino St., Ermita', '', 'City of Manila', '1000', 'Metro Manila', '1300', '133900', ''],
  ['ST-045', 'Robinsons Metro East', 'L2147, L2149, Level 2, Robinsons Metro East, Marcos Highway (Marikina-Infanta Highway), Barangay Dela Paz', 'Dela Paz', 'City of Pasig', '1600', 'Metro Manila', '1300', '137403', '137403006'],
  // ── Luzon ─────────────────────────────────────────────────────────────────
  ['ST-046', 'Robinsons Ilocos Norte', 'Level 1, Robinsons Ilocos, Brgy. 1, San Francisco', 'San Francisco', 'San Nicolas', '2901', 'Ilocos Norte', '0128', '012820', '012820001'],
  ['ST-047', 'SM City La Union', 'Second Floor, Cyberzone, SM City La Union, Barangay Biday', 'Biday', 'City of San Fernando', '2500', 'La Union', '0133', '013314', '013314012'],
  ['ST-048', 'Robinsons La Union', 'Level 3, Digiworld, Robinsons La Union, National Highway, Brgy. Sevilla', 'Sevilla', 'City of San Fernando', '2500', 'La Union', '0133', '013314', '013314057'],
  ['ST-049', 'Robinsons Tuguegarao', 'Upper Ground Level, Robinsons Tuguegarao, Maharlika Highway, Brgy. Tanza', 'Tanza', 'Tuguegarao City', '3500', 'Cagayan', '0215', '021529', '021529033'],
  ['ST-050', 'SM City Tuguegarao', '2/F, Cyberzone, SM City Tuguegarao, Bagay Road', '', 'Tuguegarao City', '3500', 'Cagayan', '0215', '021529', ''],
  ['ST-051', 'Robinsons Santiago', 'Level 1, Maharlika Highway, Mabini', 'Mabini', 'City of Santiago', '3311', 'Isabela', '0231', '023135', '023135019'],
  ['ST-052', 'SM City Urdaneta Central', '2F Cyberzone, SM Urdaneta City, MC Arthur Highway, Brgy. Nancayasan', 'Nancayasan', 'City of Urdaneta', '2428', 'Pangasinan', '0155', '015546', '015546027'],
  ['ST-053', 'Robinsons Pangasinan', 'Level 2, Robinsons Pangasinan, Dagupan—Urdaneta Road, Barangay San Miguel Rd', 'San Miguel', 'Calasiao', '2418', 'Pangasinan', '0155', '015517', '015517022'],
  ['ST-054', 'SM City Bataan', 'Second Level, Cyberzone, SM City Bataan', 'Tenejero', 'City of Balanga', '2100', 'Bataan', '0308', '030803', '030803021'], // barangay inferred from the mall's location
  ['ST-055', 'Vista Mall Bataan', '2/F Vista Mall Bataan Provincial Highway', '', 'City of Balanga', '2100', 'Bataan', '0308', '030803', ''],
  ['ST-056', 'SM City Olongapo Central', 'Level 4, Cyberzone, SM City Olongapo Central, Rizal Ave.', '', 'City of Olongapo', '2200', 'Zambales', '0371', '037107', ''],
  ['ST-057', 'Ayala Malls Harbor Point', '2/L Harbor Point Mall Rizal Highway, CBD, Subic Bay Freeport Zone', '', 'City of Olongapo', '2222', 'Zambales', '0371', '037107', ''],
  ['ST-058', 'SM City Baliwag', '2nd Floor, Cyberzone, 21 Doña Remedios Trinidad Hwy', '', 'City of Baliwag', '1630', 'Bulacan', '0314', '031403', ''],
  ['ST-059', 'SM City Marilao', 'Second Floor, SM City Marilao, MacArthur Highway, Ibayo', 'Ibayo', 'Marilao', '3019', 'Bulacan', '0314', '031411', '031411003'],
  ['ST-060', 'SM City San Jose Del Monte', 'Lower Ground Level, Cyberzone, SM City San Jose Del Monte, Quirino Highway, Barangay Tungkong Mangga', 'Tungkong Mangga', 'City of San Jose Del Monte', '3023', 'Bulacan', '0314', '031420', '031420011'],
  ['ST-061', 'SM City Clark', 'Level 2, Cyberzone, SM City Clark, Manuel A. Roxas Highway Barangay Malabanias, Clark Freeport', 'Malabañas', 'City of Angeles', '2009', 'Pampanga', '0354', '035401', '035401013'],
  ['ST-062', 'Vista Mall Pampanga', 'Ground Floor, Vista Mall Pampanga, MacArthur Highway, Barangay San Agustin', 'San Agustin', 'City of San Fernando', '2000', 'Pampanga', '0354', '035416', '035416024'],
  ['ST-063', 'SM City Pampanga', 'G/L Cyberzone, SM City Pampanga San Jose City of San Fernando Pampanga', 'San Jose', 'City of San Fernando', '2000', 'Pampanga', '0354', '035416', '035416027'],
  ['ST-064', 'SM City Telabastagan', '2nd Flr. Cyberzone SM City Telabastagan Mc Arthur Highway, Brgy. Telabastagan', 'Telabastagan', 'City of San Fernando', '2000', 'Pampanga', '0354', '035416', '035416037'],
  ['ST-065', 'Robinsons Galleria South', 'Level 2 Robinsons Galleria South', '', 'City of San Pedro', '4023', 'Laguna', '0434', '043425', ''],
  ['ST-066', 'SM City San Pablo', '2nd Flr. SM City San Pablo, National Highway, Brgy San Rafael', 'San Rafael', 'City of San Pablo', '4000', 'Laguna', '0434', '043424', '043424063'],
  ['ST-067', 'SM City Sta. Rosa', '2/F Cyberzone SM City Santa Rosa, National Road Tagapo, Sta Rosa City', 'Tagapo', 'City of Santa Rosa', '4026', 'Laguna', '0434', '043428', '043428023'],
  ['ST-068', 'Vista Mall Sta. Rosa', 'G/F Vista Mall Sta. Rosa National Highway, Tagaytay Road, Sto Domingo Sta, Rosa City', 'Santo Domingo', 'City of Santa Rosa', '4026', 'Laguna', '0434', '043428', '043428020'],
  ['ST-069', 'SM City Rosario', '2nd Floor, General Trias Drive cor. Costa Verde Access Road, Tejeros Convention', 'Tejeros Convention', 'Rosario', '4106', 'Cavite', '0421', '042117', '042117010'],
  ['ST-070', 'SM City Trece Martires', 'Lower Ground Flr SM City Trece Martires San Agustin', 'San Agustin', 'City of Trece Martires', '4109', 'Cavite', '0421', '042122', '042122006'],
  ['ST-071', 'SM City Bacoor', '4/F, Cyberzone SM City Bacoor, Tirona Hwy', '', 'City of Bacoor', '4102', 'Cavite', '0421', '042103', ''],
  ['ST-072', 'SM City Dasmariñas', '2/F Cyberzone SM City Dasmarinas Brgy Sampaloc 1 Dasmarinas City Cavite', 'Sampaloc I', 'City of Dasmariñas', '4114', 'Cavite', '0421', '042106', '042106013'],
  ['ST-073', 'SM City Tanza', '2/F, Cyberzone, SM City Tanza, Antero Soriano Highway, Barangay Daang Amaya II', 'Daang Amaya II', 'Tanza', '4108', 'Cavite', '0421', '042120', '042120034'],
  ['ST-074', 'Ayala Malls Serin', 'Level 2, Gen. Emilio Aguinaldo Highway Brgy. Silang Crossing East Tagaytay City, Cavite 4120', '', 'City of Tagaytay', '4120', 'Cavite', '0421', '042119', ''],
  ['ST-075', 'Fora Mall', 'UGF, Brgy., Crossing East, Rotunda Junction, Emilio Aguinaldo Highway', '', 'City of Tagaytay', '4120', 'Cavite', '0421', '042119', ''],
  ['ST-076', 'SM City Lipa', '2nd Flr., Cyberzone, SM City Lipa, J.P. Laurel Highway, Brgy. Marawoy Lipa City Batangas', 'Marauoy', 'City of Lipa', '4217', 'Batangas', '0410', '041014', '041014030'],
  ['ST-077', 'LIMA Estate', 'Block A, The Outlets at Lipa, Lima Technology Center, Special Economic Zone', '', 'City of Lipa', '4217', 'Batangas', '0410', '041014', ''],
  ['ST-078', 'WalterMart Tanauan', 'WTAN 202A Waltermart Tanauan, JP Laurel National Highway, Brgy. Darasa', 'Darasa', 'City of Tanauan', '4232', 'Batangas', '0410', '041031', '041031016'],
  ['ST-079', 'SM City Batangas', '2/L Cyberzone SM City Batangas, Pastor Village, Pallocan Kanluran', 'Pallocan Kanluran', 'Batangas City', '4200', 'Batangas', '0410', '041005', '041005051'],
  ['ST-080', 'SM City Sto. Tomas', '2nd Level, Cyberzone, SM City', '', 'City of Sto. Tomas', '4234', 'Batangas', '0410', '041028', ''],
  ['ST-081', 'SM City Lucena', '3/F SM City Lucena, Dalahican Rd. cor. Maharlika Highway, Brgy. Ibabang Dupay', 'Ibabang Dupay', 'City of Lucena', '4301', 'Quezon', '0456', '045624', '045624020'],
  ['ST-082', 'SM City Daet', '3/F, Cyberzone, SM City Daet, Brgy. Lag-on, Vinzons Ave.', 'Lag-On', 'Daet', '4600', 'Camarines Norte', '0516', '051603', '051603015'],
  ['ST-083', 'Robinsons Naga', 'Level 1, Robinsons Naga, Brgy, Roxas Avenue, cor Almeda Hwy', 'Triangulo', 'City of Naga', '4400', 'Camarines Sur', '0517', '051724', '051724032'], // barangay inferred from the mall's location
  ['ST-084', 'SM City Naga', 'Level 2, SM Naga, Ninoy and Cory Aquino Avenue, Central Business District II, Brgy. Triangulo', 'Triangulo', 'City of Naga', '4400', 'Camarines Sur', '0517', '051724', '051724032'],
  ['ST-085', 'SM City Legazpi', '3/F Cyberzone, SM City Legazpi, Imelda Roces Ave. Brgy 37 Bitano', 'Bgy. 37 - Bitano', 'City of Legazpi', '4500', 'Albay', '0505', '050506', '050506035'],
  ['ST-086', 'SM City Sorsogon', '2/F, Cyberzone, SM City Sorsogon, Maharlika Highway, Barangay Balogo, East District', 'Balogo (Sorsogon East District)', 'City of Sorsogon', '4700', 'Sorsogon', '0562', '056216', '056216003'],
  ['ST-087', 'SM City Tarlac', '3rd Level Cyberzone, SM City', 'San Roque', 'City of Tarlac', '2300', 'Tarlac', '0369', '036916', '036916073'], // barangay inferred from the mall's location
  ['ST-088', 'SM City Laoag', '2nd Level, Cyberzone, Barangay, 51-B Airport Rd', 'Bgy. No. 51-B, Nangalisan West', 'City of Laoag', '2900', 'Ilocos Norte', '0128', '012812', '012812040'],
  ['ST-089', 'SM City San Fernando Downtown', 'Third Level, SM City San Fernando Downtown, V. Tomico Street, cor Consunji St, Downtown Heritage District', 'Santo Rosario', 'City of San Fernando', '2000', 'Pampanga', '0354', '035416', '035416021'], // barangay inferred from the mall's location
  ['ST-090', 'SM City Cabanatuan', 'Second Level, Cyberzone, SM City Cabanatuan, Brgy. H. Concepcion, Along Maharlika Highway', 'Hermogenes C. Concepcion, Sr.', 'City of Cabanatuan', '3100', 'Nueva Ecija', '0349', '034903', '034903092'],
  ['ST-091', 'Robinsons Dasmariñas', 'Level 2, Robinsons Dasmariñas, Emilio Aguinaldo Highway, corner Governor\'s Dr, Sitio Palapala', '', 'City of Dasmariñas', '4114', 'Cavite', '0421', '042106', ''],
  // ── Visayas ───────────────────────────────────────────────────────────────
  ['ST-092', 'SM City Puerto Princesa', '2/F Cyberzone, SM City Puerto Princesa, Malvar Street, Brgy. San Miguel', 'San Miguel', 'City of Puerto Princesa', '5300', 'Palawan', '1753', '175316', '175316047'],
  ['ST-093', 'Ayala Malls Capitol Central', 'First Floor, Ayala Malls Capitol Central, Gatuslao St.', '', 'City of Bacolod', '6100', 'Negros Occidental', '0645', '064501', ''],
  ['ST-094', 'SM City J Mall', '3rd Floor, Cyberzone, SM City J Mall, 165 A. S. Fortuna St', '', 'City of Mandaue', '6014', 'Cebu', '0722', '072230', ''],
  ['ST-095', 'SM Seaside Cebu', 'Third Level, Cyberzone, SM Seaside City Cebu, Cebu South Coastal Rd, Antuwanga', '', 'City of Cebu', '6000', 'Cebu', '0722', '072217', ''],
  ['ST-096', 'Robinsons Tacloban', 'Level 2, Expansion Building, Robinsons Tacloban, Marasbaras', '', 'City of Tacloban', '6500', 'Leyte', '0837', '083747', ''],
  ['ST-097', 'Robinsons Ormoc', 'Level 1, Robinsons Ormoc, Palo - Carigara - Ormoc City Rd, Ormoc', '', 'Ormoc City', '6541', 'Leyte', '0837', '083738', ''],
  ['ST-098', 'Festive Walk Iloilo', 'Ground Flr. Festive Walk Mall, Iloilo Business Park, Airport Road, Mandurriao', 'Airport', 'City of Iloilo', '5000', 'Iloilo', '0630', '063022', '063022004'], // barangay inferred from the mall's location
  ['ST-099', 'SM City Iloilo', 'Third Floor, SM City Iloilo, Senator Benigno Aquino Jr. Avenue, Jaro West Diversion Road, Mandurriao District, Iloilo City, Iloilo 5000', '', 'City of Iloilo', '5000', 'Iloilo', '0630', '063022', ''],
  ['ST-100', 'Robinsons Iloilo', 'Level 1, Robinsons Iloilo, Corner De Leon & Quezon Sts.', '', 'City of Iloilo', '5000', 'Iloilo', '0630', '063022', ''],
  ['ST-101', 'SM City Roxas', '2/F, Cyberzone, SM City Roxas, Arnaldo Blvd.', '', 'City of Roxas', '5800', 'Capiz', '0619', '061914', ''],
  ['ST-102', 'Island City Mall', 'Second Floor, Island City Mall, Rajah Sikatuna Ave, Dao District', 'Dao', 'City of Tagbilaran', '6300', 'Bohol', '0712', '071242', '071242005'],
  ['ST-103', 'Filinvest Malls Dumaguete', 'Level 1, Filinvest Malls Dumaguete, Escano Beach, Flores Ave., Brgy. Piapi', 'Piapi', 'City of Dumaguete', '6200', 'Negros Oriental', '0746', '074610', '074610018'],
  ['ST-104', 'Boracay Station X', 'Ground Floor, Station X, Hue Hotels and Resorts Boracay, Station 2, Main Road', 'Balabag', 'Malay', '5608', 'Aklan', '0604', '060412', '060412002'], // barangay inferred from the mall's location
  ['ST-105', 'Robinsons Antique', 'Level 2, Robinsons Antique, National Highway, San Angel, San Jose de Buenavista', 'San Angel', 'San Jose', '5700', 'Antique', '0606', '060613', '060613027'],
  ['ST-106', 'SM City Consolacion', '2nd Level, Cyberzone, SM City Consolacion, Rizal Avenue (Cebu North Road), Brgy. Lamac', 'Lamac', 'Consolacion', '6001', 'Cebu', '0722', '072219', '072219007'],
  // ── Mindanao ──────────────────────────────────────────────────────────────
  ['ST-107', 'Robinsons Butuan', 'L1, Robinsons Butuan, J.C. Aquino Ave.', 'Libertad', 'City of Butuan', '8600', 'Agusan del Norte', '1602', '160202', '160202054'], // barangay inferred from the mall's location
  ['ST-108', 'SM City Butuan', '3/F, Cyberzone, SM City Butuan, J.C. Aquino Ave.', '', 'City of Butuan', '8600', 'Agusan del Norte', '1602', '160202', ''],
  ['ST-109', 'Robinsons Iligan', 'Ground Floor, Robinsons Iligan, Macapagal Ave', 'Tubod', 'City of Iligan', '9200', 'Lanao del Norte', '1035', '103504', '103504030'], // barangay inferred from the mall's location
  ['ST-110', 'SM Lanang Premier', '3/F Cyberzone SM Lanang Premier, JP Laurel Ave.', '', 'City of Davao', '8000', 'Davao del Sur', '1124', '112402', ''],
  ['ST-111', 'SM Cagayan de Oro Downtown Premiere', '3/F Cyberzone SM Cagayan De Oro Premier, Claro M. Recto Ave., Cor. Osmeña St.', '', 'City of Cagayan De Oro', '9000', 'Misamis Oriental', '1043', '104305', ''],
  ['ST-112', 'SM City Cagayan de Oro', '3/F Cyberzone, SM Cagayan De Oro, Masterson Ave.', '', 'City of Cagayan De Oro', '9000', 'Misamis Oriental', '1043', '104305', ''],
  ['ST-113', 'Robinsons Valencia', 'Level 1, Robinsons Valencia, Sayre Highway, Brgy. Hagkol, Bagontaas', 'Bagontaas', 'City of Valencia', '8709', 'Bukidnon', '1013', '101321', '101321001'],
  ['ST-114', 'KCC Mall de Zamboanga', 'Third Floor, KCC Mall de Zamboanga, Gov. Camins Ave. Camino Nuevo', 'Camino Nuevo', 'City of Zamboanga', '7000', 'Zamboanga del Sur', '0973', '097332', '097332099'],
  ['ST-115', 'SM City Mindpro', '4/F, La Purisima St.', '', 'City of Zamboanga', '7000', 'Zamboanga del Sur', '0973', '097332', ''],
  ['ST-116', 'SM City Zamboanga', '2nd Flr., Cyberzone SM City Zamboanga Vitaliano Agan Ave., Camino Nuevo', 'Camino Nuevo', 'City of Zamboanga', '7000', 'Zamboanga del Sur', '0973', '097332', '097332099'],
  ['ST-117', 'Gaisano Mall of Toril', 'Space Nos. 18-19, 2nd flr., Gmall of Toril, Lim Street, McArthur Highway, Toril, 8000', 'Toril', 'City of Davao', '8000', 'Davao del Sur', '1124', '112402', '112402126'],
  ['ST-118', 'Gaisano Mall of Tagum', '3F-12, Gaisano Mall of Tagum, Nat\'l Highway, Briz District, Magugpo East', 'Magugpo East', 'City of Tagum', '8100', 'Davao del Norte', '1123', '112319', '112319023'],
  ['ST-119', 'Gaisano Mall of Digos', '2F-11, Second Floor, Gmall of Digos, Upper Digos, Tres De Mayo, 8002 City of', 'Tres De Mayo', 'City of Digos', '8002', 'Davao del Sur', '1124', '112403', '112403027'],
  ['ST-120', 'SM City General Santos', 'Space Nos. 337-338, SM City General Santos, San Miguel Street corner Santiago Boulevard, Lagao, 9500', 'Lagao', 'City of General Santos', '9500', 'South Cotabato', '1263', '126303', '126303011'],
  ['ST-121', 'Sta. Lucia Mall Davao', 'Unit No. T1, 3rd Floor, Sta. Lucia Mall Davao, 12 Pan-Philippine Highway, Communal, Buhangin District, 8000', 'Communal', 'City of Davao', '8000', 'Davao del Sur', '1124', '112402', '112402035'],
  ['ST-122', 'Robinsons Pagadian', 'Level 2-227, Robinsons Pagadian Mall F.S Pajares Ave. cor.P.L Urro St. cor. Vicenzo Sagun St. San Francisco', 'San Francisco', 'City of Pagadian', '7016', 'Zamboanga del Sur', '0973', '097322', '097322039'],
  ['ST-123', 'SM City Cagayan de Oro Uptown', '3/F, Cyberzone, SM, Masterson Ave, Cagayan de Oro, Lalawigan ng Misamis Oriental', '', 'City of Cagayan De Oro', '9000', 'Misamis Oriental', '1043', '104305', ''],
  ['ST-124', 'Gaisano Mall of Davao', 'Spaces no. 43, 3F, GMall of Davao, J.P. Laurel Avenue, Bajada', '', 'City of Davao', '8000', 'Davao del Sur', '1124', '112402', ''],
  ['ST-125', 'Robinsons Gen San', 'Ground Floor, Robinsons Gen San, Jose Catolico Sr. Ave., General Santos City (Dadiangas)', '', 'City of General Santos', '9500', 'South Cotabato', '1263', '126303', ''],
];

export const SEED_STORE_WAREHOUSES: Warehouse[] = ROWS.map(
  ([code, name, addressLine, block, city, zip, province, provinceCode, cityCode, barangayCode]) => ({
    id: `wh-${code}`,
    code,
    name,
    type: 'store',
    address: blankPostalAddress({ addressLine, block, city, zip, province, provinceCode, cityCode, barangayCode }),
    binEnabled: false,
    active: true,
  }),
);
