/**
 * Source de vérité : chaque championnat et ses clubs.
 * On dérive CLUBS (liste plate) et CLUB_TO_LEAGUE (Map club→championnat) depuis cette structure.
 */

export const LEAGUE_CLUBS: Record<string, string[]> = {
  // ── Top 5 ─────────────────────────────────────────────────────────
  'Ligue 1': [
    'Paris Saint-Germain', 'Olympique de Marseille', 'Olympique Lyonnais', 'AS Monaco', 'LOSC Lille',
    'Stade Rennais', 'OGC Nice', 'RC Lens', 'Stade Brestois', 'RC Strasbourg',
    'Montpellier HSC', 'FC Nantes', 'Toulouse FC', 'Stade de Reims', 'Le Havre AC',
    'AJ Auxerre', 'AS Saint-Étienne', 'Angers SCO',
  ],
  'Ligue 2': [
    'FC Metz', 'SM Caen', 'Paris FC', 'ES Troyes AC', 'FC Lorient', 'Amiens SC',
    'Grenoble Foot', 'Rodez AF', 'USL Dunkerque', 'SC Bastia', 'FC Martigues', 'Red Star FC',
  ],
  'Premier League': [
    'Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United',
    'Tottenham Hotspur', 'Newcastle United', 'Aston Villa', 'West Ham United', 'Brighton & Hove Albion',
    'Crystal Palace', 'Wolverhampton Wanderers', 'Fulham', 'Everton', 'Brentford',
    'Nottingham Forest', 'Bournemouth', 'Southampton', 'Leicester City', 'Ipswich Town',
  ],
  'EFL Championship': [
    'Leeds United', 'Burnley', 'Sheffield United', 'Sunderland', 'Middlesbrough',
    'West Bromwich Albion', 'Norwich City', 'Coventry City', 'Stoke City', 'Watford',
    'Swansea City', 'Huddersfield Town', 'Bristol City', 'Blackburn Rovers',
    'Cardiff City', 'Millwall', 'Plymouth Argyle', 'QPR', 'Preston North End',
    'Hull City', 'Sheffield Wednesday', 'Derby County', 'Luton Town', 'Portsmouth FC',
    'Oxford United', 'Birmingham City', 'Bristol Rovers', 'Rotherham United',
    'Charlton Athletic', 'Exeter City', 'Burton Albion', 'Peterborough United',
    'Stevenage FC', 'Wycombe Wanderers',
  ],
  'La Liga': [
    'Real Madrid', 'FC Barcelona', 'Atlético de Madrid', 'Real Sociedad', 'Real Betis',
    'Villarreal CF', 'Athletic Club', 'Sevilla FC', 'Valencia CF', 'Girona FC',
    'RC Celta de Vigo', 'RCD Mallorca', 'Getafe CF', 'Rayo Vallecano', 'CA Osasuna',
    'UD Las Palmas', 'Deportivo Alavés', 'Cádiz CF', 'Granada CF', 'RCD Espanyol',
  ],
  'La Liga 2': [
    'Levante UD', 'Real Valladolid', 'SD Huesca', 'Sporting de Gijón', 'UD Almería',
    'Real Zaragoza', 'SD Eibar', 'Elche CF', 'CD Leganés', 'Racing de Santander',
    'Burgos CF', 'Albacete BP', 'Deportivo de La Coruña', 'Málaga CF', 'CD Mirandés',
    'FC Cartagena', 'UD Ibiza', 'Real Oviedo', 'CD Tenerife', 'Eldense',
    'Racing de Ferrol', 'Castellón CF', 'CD Eldense', 'Andorra CF',
  ],
  'Serie A': [
    'Inter Milan', 'AC Milan', 'Juventus', 'SSC Napoli', 'AS Roma',
    'SS Lazio', 'Atalanta BC', 'ACF Fiorentina', 'Bologna FC', 'Torino FC',
    'Udinese Calcio', 'Genoa CFC', 'US Sassuolo', 'Hellas Verona', 'Cagliari Calcio',
    'Empoli FC', 'US Lecce', 'Frosinone Calcio', 'Salernitana', 'Como 1907',
  ],
  'Serie B': [
    'Parma Calcio', 'Venezia FC', 'US Cremonese', 'Brescia Calcio',
    'Palermo FC', 'US Catanzaro', 'Sampdoria', 'Spezia Calcio', 'Bari', 'Pisa SC',
    'AC Cesena', 'Mantova 1911', 'SSD Cosenza Calcio', 'Juve Stabia',
    'AS Cittadella', 'Südtirol', 'Carrarese Calcio', 'Reggiana', 'Modena FC',
    'AC Sudtirol', 'Ascoli Calcio', 'SPAL', 'Ternana Calcio', 'FC Crotone',
  ],
  'Bundesliga': [
    'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'VfB Stuttgart',
    'Eintracht Frankfurt', 'VfL Wolfsburg', 'SC Freiburg', 'Borussia Mönchengladbach', 'TSG Hoffenheim',
    '1. FC Union Berlin', 'Werder Bremen', 'FC Augsburg', '1. FC Heidenheim', 'SV Darmstadt 98',
    '1. FC Köln', 'FC St. Pauli',
  ],
  '2. Bundesliga': [
    'Hertha BSC', 'Hamburger SV', 'Fortuna Düsseldorf', 'Hannover 96', 'Karlsruher SC',
    '1. FC Nürnberg', 'FC Schalke 04',
    'SpVgg Greuther Fürth', 'SV Elversberg', 'Eintracht Braunschweig',
    'VfL Osnabrück', 'SSV Jahn Regensburg', 'SC Paderborn', 'Preußen Münster',
    'FC Kaiserslautern',
  ],

  // ── Europe ────────────────────────────────────────────────────────
  'Liga Portugal': [
    'SL Benfica', 'FC Porto', 'Sporting CP', 'SC Braga', 'Vitória SC',
    'CF Os Belenenses', 'Gil Vicente FC', 'Rio Ave FC', 'Boavista FC', 'Casa Pia AC',
    'Moreirense FC', 'Estrela da Amadora', 'Arouca', 'Famalicão', 'Estoril Praia',
  ],
  'Liga Portugal 2': [
    'FC Vizela', 'CD Tondela', 'GD Chaves', 'FC Paços de Ferreira', 'SC Covilhã',
    'FC Penafiel', 'CD Feirense', 'UD Oliveirense', 'Académica de Coimbra',
    'FC Leixões', 'Varzim SC', 'Académico de Viseu', 'FC Alverca', 'UD Vilafranquense',
  ],
  'Eredivisie': [
    'Ajax Amsterdam', 'PSV Eindhoven', 'Feyenoord Rotterdam', 'AZ Alkmaar', 'FC Twente',
    'FC Utrecht', 'Vitesse Arnhem', 'SC Heerenveen', 'FC Groningen', 'Sparta Rotterdam',
    'NEC Nijmegen', 'Go Ahead Eagles', 'Fortuna Sittard', 'RKC Waalwijk', 'PEC Zwolle',
    'Heracles Almelo', 'Willem II', 'Excelsior Rotterdam', 'FC Volendam',
  ],
  'Eerste Divisie': [
    'NAC Breda', 'ADO Den Haag', 'FC Emmen', 'Almere City FC', 'FC Dordrecht',
    'FC Den Bosch', 'Roda JC Kerkrade', 'SC Cambuur', 'Jong Ajax', 'Jong PSV',
    'Jong AZ', 'TOP Oss', 'FC Eindhoven', 'MVV Maastricht',
  ],
  'Jupiler Pro League': [
    'Club Brugge', 'RSC Anderlecht', 'Royal Antwerp FC', 'KRC Genk', 'KAA Gent',
    'Standard de Liège', 'Union Saint-Gilloise', 'Cercle Brugge', 'OH Leuven', 'KV Mechelen',
    'KV Kortrijk', 'Charleroi SC', 'Westerlo', 'Sint-Truidense VV', 'RWDM',
    'FCV Dender', 'Beerschot VA',
  ],
  'Challenger Pro League': [
    'K. Beerschot V.A.', 'Lommel United', 'SK Beveren', 'RWD Molenbeek',
    'AFC Tubize', 'OH Leuven B',
  ],
  'Super Lig Turquie': [
    'Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor', 'İstanbul Başakşehir',
    'Adana Demirspor', 'Antalyaspor', 'Kayserispor', 'Konyaspor', 'Alanyaspor',
    'Sivasspor', 'Gaziantep FK', 'Hatayspor', 'Kasımpaşa', 'Rizespor',
  ],
  'Super League Suisse': [
    'BSC Young Boys', 'FC Bâle', 'FC Zurich', 'Servette FC', 'FC Lugano',
    'FC St. Gallen', 'FC Lucerne', 'Grasshopper Club Zurich', 'FC Sion', 'Lausanne-Sport',
  ],
  'Superligaen': [
    'FC Copenhague', 'FC Midtjylland', 'Bröndby IF', 'FC Nordsjælland', 'Silkeborg IF',
    'Aarhus GF', 'AaB Aalborg', 'Viborg FF', 'Randers FC', 'Odense BK',
  ],
  'Allsvenskan': [
    'Malmö FF', 'AIK', 'Djurgårdens IF', 'Hammarby IF', 'IF Elfsborg',
    'IFK Göteborg', 'IFK Norrköping', 'BK Häcken', 'Kalmar FF', 'Helsingborgs IF',
  ],
  'Eliteserien': [
    'Rosenborg BK', 'Molde FK', 'FK Bodø/Glimt', 'Vålerenga IF', 'Viking FK',
    'Lillestrøm SK', 'Brann Bergen', 'Sarpsborg 08', 'Stabæk IF', 'Tromsø IL',
  ],
  'Bundesliga Autriche': [
    'RB Salzbourg', 'SK Rapid Wien', 'SK Sturm Graz', 'LASK', 'Wolfsberger AC',
    'FK Austria Wien', 'TSV Hartberg', 'SCR Altach', 'SV Ried',
  ],
  'SuperLiga Serbie': [
    'Étoile Rouge de Belgrade', 'Partizan Belgrade', 'FK Vojvodina', 'FK Čukarički',
    'FK TSC Bačka Topola',
  ],
  'HNL Croatie': [
    'Dinamo Zagreb', 'Hajduk Split', 'NK Osijek', 'Rijeka', 'Lokomotiva Zagreb',
  ],
  'Super League Grèce': [
    'Olympiacos Le Pirée', 'Panathinaikos', 'AEK Athènes', 'PAOK Thessalonique', 'Aris Thessalonique',
  ],
  'Premier League Ukrainienne': [
    'Shakhtar Donetsk', 'Dynamo Kyiv', 'Zorya Luhansk', 'SC Dnipro-1',
    'Metalist Kharkiv', 'Vorskla Poltava', 'Chornomorets Odesa',
    'FC Mynai', 'Metalist 1925 Kharkiv', 'Rukh Lviv',
  ],
  'Erovnuli Liga Géorgie': [
    'Dinamo Tbilissi', 'Dinamo Batumi', 'FC Torpedo Kutaisi',
    'FC Saburtalo', 'FC Guria Lanchkhuti', 'FC Telavi',
  ],
  'Premier League Russe': [
    'Zenit Saint-Pétersbourg', 'CSKA Moscou', 'Spartak Moscou', 'Lokomotiv Moscou',
    'FC Krasnodar', 'FC Dynamo Moscou', 'FK Rostov', 'FC Akhmat Grozny',
    'PFC Krylya Sovetov', 'FC Rubin Kazan', 'Torpedo Moscou', 'FK Nizhny Novgorod',
    'FC Orenbourg', 'FC Ural Ekaterinbourg',
  ],
  'Ekstraklasa': [
    'Legia Varsovie', 'Lech Poznań', 'Raków Częstochowa', 'Jagiellonia Białystok',
    'Zagłębie Lubin', 'Pogoń Szczecin', 'Wisła Kraków', 'Śląsk Wrocław',
    'Cracovia', 'Górnik Zabrze', 'Lechia Gdańsk', 'Warta Poznań',
    'Piast Gliwice', 'Korona Kielce', 'Widzew Łódź', 'ŁKS Łódź',
  ],
  'Premier League Roumanie': [
    'FCSB', 'CFR Cluj', 'Universitatea Craiova', 'Rapid Bucarest',
    'Petrolul Ploiești', 'FC Voluntari', 'Sepsi OSK', 'Politehnica Iași',
    'FC Hermannstadt', 'FCU Craiova 1948', 'Chindia Târgoviște', 'FC Botoșani',
  ],
  'Fortuna Liga Tchéquie': [
    'Sparta Prague', 'Slavia Prague', 'FC Viktoria Plzeň', 'SK Sigma Olomouc',
    'FK Mladá Boleslav', 'FC Zlín', 'Bohemians 1905', 'FK Teplice',
    'FK Jablonec', 'FC Zbrojovka Brno', 'FC Slovácko',
  ],
  'NB I Hongrie': [
    'Ferencvárosi TC', 'MOL Fehérvár FC', 'Puskás Akadémia FC',
  ],
  'Fortuna Liga Slovaquie': [
    'FK Slovan Bratislava', 'FK DAC Dunajská Streda', 'MFK Ružomberok',
    'FC Spartak Trnava', 'FK Žilina', 'MFK Zemplín Michalovce', 'FK Senica',
  ],
  'Premier League Écosse': [
    'Celtic FC', 'Rangers FC', 'Heart of Midlothian', 'Hibernian FC', 'Aberdeen FC',
    'Motherwell FC', 'St. Johnstone', 'Kilmarnock FC', 'Ross County', 'St. Mirren',
    'Livingston FC', 'Dundee FC', 'Dundee United', 'Inverness CT', 'Partick Thistle',
    'Falkirk FC', 'Dunfermline Athletic', 'Hamilton Academical', 'Airdrieonians',
    'Ayr United', "Queen's Park FC", 'Raith Rovers',
  ],
  'League of Ireland': [
    'Shamrock Rovers', 'Bohemian FC', 'Dundalk FC', 'Shelbourne FC',
    "St. Patrick's Athletic", 'Cork City FC', 'Derry City FC', 'Drogheda United',
    'Sligo Rovers', 'Waterford FC',
  ],
  'Premier League Islande': [
    'KR Reykjavík', 'Breiðablik', 'Valur Reykjavík', 'Víkingur Reykjavík',
    'ÍA Akranes', 'Fram Reykjavík', 'FH Hafnarfjörður', 'Keflavík FC',
  ],
  'Première Ligue Bulgarie': [
    'PFC CSKA Sofia', 'PFC Ludogorets Razgrad', 'PFC Lokomotiv Plovdiv',
    'Botev Plovdiv', 'FC Levski Sofia', 'PFC Beroe Stara Zagora',
    'PFC Lokomotiv Sofia',
  ],
  'Premijer Liga Bosnie': [
    'FK Borac Banja Luka', 'FK Sarajevo', 'FK Zrinjski Mostar',
    'FK Velež Mostar', 'NK Čelik Zenica',
  ],
  'Superliga Albanie': [
    'FK Partizani Tirana', 'FK Vllaznia Shkodër', 'FK Dinamo Tirana',
    'FK Tirana', 'KF Skënderbeu Korçë',
  ],

  // ── Autres Europe ─────────────────────────────────────────────────
  'Prva Liga Slovénie': [
    'NK Olimpija Ljubljana', 'NK Maribor', 'NK Koper', 'NK Mura', 'NK Domžale',
    'NK Radomlje', 'NK Celje',
  ],
  'Vysshaya Liga Biélorussie': [
    'FC BATE Borisov', 'FC Dynamo Minsk', 'FC Shakhtar Soligorsk',
    'FC Neman Grodno', 'FK Isloch',
  ],
  'Super Liga Moldavie': [
    'FC Sheriff Tiraspol', 'FC Sfântul Gheorghe', 'FC Milsami Orhei', 'FC Petrocub',
  ],
  'Meistriliiga Estonie': [
    'FC Flora Tallinn', 'FCI Levadia Tallinn', 'FC Kalev Tallinn',
  ],
  'Virsliga Lettonie': [
    'FK RFS', 'FK Riga', 'FK Liepāja', 'FK Jelgava',
  ],
  'A Lyga Lituanie': [
    'FK Žalgiris', 'FK Sūduva', 'FK Riteriai',
  ],
  'First Division Chypre': [
    'APOEL FC', 'Omonia Nicosie', 'AEL Limassol', 'Apollon Limassol',
    'AC Omonoia', 'AEK Larnaca',
  ],
  'Bardzraguyn Khumb Arménie': [
    'FC Pyunik Yerevan', 'FC Ararat-Armenia', 'FC Shirak',
    'FC Banants', 'FC Urartu',
  ],
  'Premyer Liqa Azerbaïdjan': [
    'FK Qarabağ', 'Neftchi Bakou', 'FK Sabah', 'FK Zira',
    'FK Gabala', 'FK Keşlə',
  ],
  'Superliga Kosovo': [
    'FC Drita', 'FC Prishtina', 'FC Ballkani', 'FC Llapi',
  ],
  'Prva Liga Macédoine du Nord': [
    'FK Shkupi', 'FK Rabotnički', 'FK Vardar', 'FK Sileks',
  ],
  'Prva Crnogorska Liga': [
    'FK Budućnost Podgorica', 'FK Sutjeska Nikšić', 'FK Zeta',
  ],
  'BGL Ligue Luxembourg': [
    'F91 Dudelange', 'CS Fola Esch', 'Racing FC Union Lëtzebuerg',
  ],
  'NIFL Premiership': [
    'Linfield FC', 'Glentoran FC', 'Cliftonville FC', 'Coleraine FC',
    'Crusaders FC', 'Larne FC',
  ],
  'Cymru Premier': [
    'The New Saints FC', "Connah's Quay Nomads", 'Bala Town FC',
    'Aberystwyth Town',
  ],

  // ── Amérique du Sud ───────────────────────────────────────────────
  'Liga Profesional Argentina': [
    'Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo',
    'Vélez Sarsfield', 'Estudiantes de La Plata', 'Lanús', 'Defensa y Justicia',
    'Talleres de Córdoba', 'Rosario Central', "Newell's Old Boys", 'Argentinos Juniors',
    'Club Atlético Huracán', 'Colón de Santa Fe', 'Club Banfield',
    'Platense FC', 'Sarmiento de Junín', 'Barracas Central',
    'Club Atletico Belgrano',
  ],
  'Liga BetPlay Colombie': [
    'Atlético Nacional', 'Millonarios FC', 'América de Cali', 'Junior de Barranquilla',
    'Deportivo Cali', 'Independiente Santa Fe', 'Once Caldas',
  ],
  'Primera División Uruguay': [
    'Club Nacional de Football', 'CA Peñarol', 'Montevideo Wanderers', 'Defensor Sporting',
  ],
  'Primera División Chili': [
    'Colo-Colo', 'Universidad de Chile', 'Universidad Católica',
    'Huachipato', 'Unión La Calera', 'CD Ñublense', 'Deportes Antofagasta',
    'Deportes Iquique', 'CD Palestino', 'Everton de Viña del Mar',
    'Santiago Wanderers', 'CD Universidad de Concepción',
  ],
  'Liga 1 Pérou': [
    'Universitario de Deportes', 'Alianza Lima', 'Sporting Cristal',
    'Club FBC Melgar', 'Cienciano', 'Cusco FC', 'Sport Boys',
    'Club Alianza Atlético', 'Deportivo Garcilaso',
  ],
  'Liga Pro Équateur': [
    'Barcelona SC', 'LDU de Quito', 'Independiente del Valle', 'CS Emelec',
    'El Nacional', 'Técnico Universitario', 'Aucas FC', 'Delfín SC',
    'Macará', 'Mushuc Runa',
  ],
  'Primera División Bolivie': [
    'Club Bolívar', 'The Strongest', 'Club Jorge Wilstermann', 'Club Always Ready',
    'Oriente Petrolero', 'Club Destroyers', 'Real Potosí',
  ],
  'Primera División Paraguay': [
    'Club Olimpia', 'Cerro Porteño', 'Club Libertad', 'Club Sol de América',
    'Club Guaraní', 'Sportivo Luqueño',
  ],
  'Primera División Venezuela': [
    'Caracas FC', 'Deportivo Táchira', 'Carabobo FC', 'Deportivo Lara',
    'Academia Puerto Cabello', 'Zamora FC',
  ],

  // ── Amérique du Nord / Centrale ───────────────────────────────────
  'MLS': [
    'LA Galaxy', 'Inter Miami CF', 'Atlanta United FC', 'LAFC', 'Los Angeles FC', 'Seattle Sounders FC',
    'New York City FC', 'New York Red Bulls', 'Toronto FC', 'CF Montréal', 'Vancouver Whitecaps',
    'Austin FC', 'Nashville SC', 'Charlotte FC', 'FC Cincinnati', 'Columbus Crew',
    'Portland Timbers', 'San Jose Earthquakes', 'Colorado Rapids', 'Real Salt Lake',
    'Minnesota United FC', 'Chicago Fire FC', 'DC United', 'New England Revolution',
    'Philadelphia Union', 'Orlando City SC', 'FC Dallas', 'Houston Dynamo FC',
    'Sporting Kansas City', 'St. Louis City SC', 'San Diego FC',
  ],
  'Liga MX': [
    'Club América', 'CF Monterrey', 'Chivas Guadalajara', 'Cruz Azul', 'UNAM Pumas',
    'Tigres UANL', 'Toluca FC', 'Santos Laguna', 'León', 'Pachuca',
  ],
  'Liga de Expansión MX': [
    'Tampico Madero', 'Mineros de Zacatecas', 'FC Juárez',
    'Dorados de Sinaloa', 'Atlético de San Luis',
  ],
  'Liga Nacional Guatemala': [
    'Comunicaciones FC', 'Municipal FC', 'CSD Xelajú MC', 'Malacateco FC',
  ],
  'Liga Nacional Honduras': [
    'CD Olimpia', 'CD Motagua', 'Real CD España', 'Club Deportivo Marathon',
  ],
  'Primera División El Salvador': [
    'CD Águila', 'Alianza FC', 'FAS El Salvador',
  ],
  'Primera División Costa Rica': [
    'Deportivo Saprissa', 'Liga Deportiva Alajuelense', 'CS Herediano',
  ],
  'Liga Panameña': [
    'CD Plaza Amador', 'Tauro FC', 'CA Independiente Panamá',
  ],

  // ── Afrique ───────────────────────────────────────────────────────
  'Botola Pro Maroc': [
    'Wydad AC', 'Raja Casablanca', 'AS FAR Rabat', 'FUS de Rabat', 'RS Berkane',
    'Maghreb de Fès', 'Renaissance Zemamra', 'Hassania dAgadir', 'Olympique de Khouribga',
  ],
  'Ligue 1 Algérie': [
    'USM Alger', 'MC Alger', 'JS Kabylie', 'CR Belouizdad', 'ES Sétif',
  ],
  'Ligue Professionnelle 1 Tunisie': [
    'Espérance de Tunis', 'Club Africain', 'Étoile du Sahel', 'CS Sfaxien', 'US Monastir',
  ],
  'Egyptian Premier League': [
    'Al Ahly SC', 'Zamalek SC', 'Pyramids FC', 'Al Masry', 'Ismaily SC',
  ],
  'NPFL Nigeria': [
    'Enyimba FC', 'Kano Pillars', 'Rangers International', 'Lobi Stars',
  ],
  'Ghana Premier League': [
    'Asante Kotoko', 'Hearts of Oak', 'Accra Lions', 'Aduana Stars',
    'King Faisal', 'Medeama SC', 'Dreams FC', 'Bechem United',
  ],
  'Ligue 1 Cameroun': [
    'Canon Yaoundé', 'Coton Sport', 'Union Douala', 'Tonnerre Yaoundé',
    'FAP FC', 'Eding Sport',
  ],
  'Ligue 1 Sénégal': [
    'ASC Jaraaf', 'Casa Sports', 'US Gorée', 'AS Douanes',
    'ASC Yeggo', 'Dakar Sacré-Cœur',
  ],
  "Ligue 1 Côte d'Ivoire": [
    'ASEC Mimosas', 'Africa Sports', 'Stade dAbidjan',
    'Séwé Sports', 'SOA Abidjan', 'Williamsville Athletic Club',
  ],
  'Linafoot RD Congo': [
    'TP Mazembe', 'AS Vita Club', 'DC Motema Pembe',
  ],
  'Premier League Afrique du Sud': [
    'Kaizer Chiefs', 'Orlando Pirates', 'Mamelodi Sundowns', 'Cape Town City',
  ],
  'Ligue 1 Mali': [
    'Djoliba AC', 'Stade Malien', 'AS Real Bamako', 'AS Biton',
  ],
  'Ligue 1 Guinée': [
    'Horoya AC', 'Hafia FC', 'AS Kaloum Star', 'Satellite FC',
  ],
  'Ligue 1 Burkina Faso': [
    'ASFA-Yennenga', 'Majestics FC', 'Salitas FC', 'EFO Ouagadougou',
  ],
  'Premier League Kenya': [
    'Gor Mahia', 'AFC Leopards', 'Tusker FC', 'KCB FC',
    'Nairobi City Stars', 'Bandari FC',
  ],
  'Premier League Tanzanie': [
    'Simba SC', 'Young Africans SC', 'Azam FC', 'Mtibwa Sugar FC',
  ],
  'Premier League Éthiopie': [
    'St. George SC', 'Ethiopia Coffee SC', 'Fasil Kenema',
  ],
  'Premier League Ouganda': [
    'Express FC', 'KCCA FC', 'Vipers SC', 'SC Villa',
  ],
  'Premier League Zimbabwe': [
    'Dynamos FC', 'CAPS United', 'FC Platinum', 'Manica Diamonds',
  ],
  'Super League Zambie': [
    'Zesco United', 'Zanaco FC', 'Forest Rangers FC', 'Nkana FC',
  ],
  'Premier League Rwanda': [
    'APR FC', 'Rayon Sports', 'Police FC Rwanda',
  ],
  'Girabola Angola': [
    'Petro de Luanda', 'Primeiro de Agosto', 'Sagrada Esperança', 'ASA FC',
  ],
  'Moçambola': [
    'UD Maxaquene', 'Ferroviário de Maputo', 'Costa do Sol FC',
  ],
  'Premier League Soudan': [
    'Al Hilal Omdurman', 'Al Merrikh',
  ],

  // ── Asie ──────────────────────────────────────────────────────────
  'Saudi Pro League': [
    'Al-Hilal', 'Al-Nassr', 'Al-Ittihad', 'Al-Ahli', 'Al-Shabab', 'Al-Ettifaq', 'Al-Fateh',
  ],
  'Stars League Qatar': [
    'Al-Sadd SC', 'Al-Duhail SC', 'Al-Rayyan SC', 'Al-Gharafa SC',
  ],
  'UAE Pro League': [
    'Al-Ain FC', 'Al-Wahda', 'Shabab Al-Ahli', 'Al-Jazira', 'Al-Wasl',
  ],
  'Persian Gulf Pro League': [
    'Persepolis FC', 'Esteghlal FC', 'Sepahan FC', 'Tractor FC',
  ],
  'J1 League': [
    'Vissel Kobe', 'Yokohama F. Marinos', 'Kawasaki Frontale', 'Urawa Red Diamonds',
    'FC Tokyo', 'Kashima Antlers', 'Gamba Osaka', 'Cerezo Osaka', 'Nagoya Grampus',
    'Sagan Tosu', 'Sanfrecce Hiroshima', 'Consadole Sapporo',
    'Kyoto Sanga', 'Shimizu S-Pulse', 'Jubilo Iwata',
  ],
  'J2 League': [
    'V-Varen Nagasaki',
  ],
  'K League 1': [
    'Jeonbuk Hyundai Motors', 'Ulsan Hyundai', 'FC Seoul', 'Pohang Steelers',
    'Incheon United', 'Suwon Samsung Bluewings', 'Seongnam FC',
    'Daejeon Citizen', 'Gangwon FC',
  ],
  'Chinese Super League': [
    'Shanghai Port', 'Guangzhou FC', 'Shandong Taishan', 'Beijing Guoan',
    'Wuhan Three Towns', 'Zhejiang FC', 'Shenzhen FC', 'Dalian Professional',
  ],
  'Indian Super League': [
    'ATK Mohun Bagan', 'Bengaluru FC', 'Mumbai City FC', 'FC Goa',
    'Hyderabad FC', 'Chennaiyin FC', 'Kerala Blasters', 'NorthEast United FC',
    'Jamshedpur FC', 'Odisha FC', 'East Bengal FC', 'Punjab FC',
  ],
  'Thai League 1': [
    'Buriram United', 'Chiang Rai United', 'BG Pathum United',
    'Port FC', 'Muangthong United', 'Chiangmai FC', 'Nakhon Ratchasima FC',
  ],
  'V.League 1': [
    'Hanoi FC', 'Becamex Binh Duong', 'Hoang Anh Gia Lai', 'SHB Da Nang',
    'Viettel FC',
  ],
  'Liga 1 Indonésie': [
    'Persija Jakarta', 'Persib Bandung', 'Arema FC', 'PSM Makassar',
    'Persipura Jayapura', 'Bali United', 'Bhayangkara FC',
  ],
  'Malaysia Super League': [
    'Selangor FA', "Johor Darul Ta'zim", 'Kuala Lumpur City FC', 'Pahang FA',
    'Sabah FA',
  ],
  'Jordan League': [
    'Al-Wehdat', 'Al-Faisaly', 'Al-Ramtha',
  ],
  'Lebanese Premier League': [
    'Al-Ahed', 'Nejmeh SC', 'Al-Ansar',
  ],
  'Iraqi Premier League': [
    'Al-Shorta', 'Al-Zawraa', 'Air Force Club Iraq', 'Erbil FC',
  ],
  'Kuwait Premier League': [
    'Kuwait SC', 'Al Qadsia', 'Al Arabi Kuwait',
  ],
  'Bahraini Premier League': [
    'Riffa SC', 'Al Muharraq', 'East Riffa',
  ],
  'Super League Ouzbékistan': [
    'FC Lokomotiv Tashkent', 'FC Nasaf', 'FC Pakhtakor', 'FC Navbahor',
  ],
  'Premier League Kazakhstan': [
    'FC Kairat', 'FC Astana', 'FC Shakhtar Karagandy', 'FC Tobol',
  ],

  // ── Océanie ───────────────────────────────────────────────────────
  'A-League Men': [
    'Melbourne Victory', 'Sydney FC', 'Melbourne City', 'Western Sydney Wanderers',
    'Adelaide United', 'Perth Glory', 'Brisbane Roar', 'Wellington Phoenix', 'Macarthur FC',
    'Central Coast Mariners', 'Newcastle Jets', 'Western United',
  ],
  'New Zealand Football Championship': [
    'Auckland City FC', 'Team Wellington', 'Waitakere United',
    'Wellington Phoenix Reserves',
  ],

  // ── Caraïbes ──────────────────────────────────────────────────────
  'Jamaica Premier League': [
    'Portmore United FC', 'Cavalier SC', 'Waterhouse FC',
  ],
  'TT Pro League': [
    'W Connection FC', 'Defence Force FC',
  ],
  'Liga Dominicana': [
    'Cibao FC', 'Atlético Pantoja',
  ],

  // ── Divers ────────────────────────────────────────────────────────
  'Libyan Premier League': [
    'Al Ahli Tripoli', 'Al Ittihad Tripoli', 'Al Tahaddy',
  ],
  'Namibia Premier League': [
    'African Stars FC', 'FLy FC',
  ],
  'Botswana Premier League': [
    'Township Rollers', 'Jwaneng Galaxy',
  ],
  'Hong Kong Premier League': [
    'Kitchee SC', 'Lee Man FC', 'Eastern SC Hong Kong', 'South China AA',
  ],
  'Cambodia League': [
    'Phnom Penh Crown FC', 'Nagaworld FC',
  ],
  'Myanmar National League': [
    'Ayeyawady United', 'Yangon United', 'Shan United FC',
  ],
  'Bangladesh Premier League': [
    'Bashundhara Kings', 'Abahani Limited Dhaka', 'Sheikh Jamal DC',
  ],
  'Nepal Super League': [
    'Three Star Club', 'Tribhuvan Army FC', 'Machhindra FC',
  ],
  'Sri Lanka Football Premier League': [
    'Colombo FC', 'Renown SC',
  ],
  'Ligue 1 Gabon': [
    'AS Mangasport',
  ],
  'Ligue 1 Congo': [],
  'Ligue 1 Madagascar': [],
  'Papua New Guinea NSL': [
    'Lae City Hunters', 'Hekari United',
  ],
  'Fiji Premier League': [
    'Ba FC', 'Labasa FC', 'Nadroga FC',
  ],

  // ── Divisions secondaires / championnats supplémentaires ───────────
  'Úrvalsdeild': [],
  'Challenge League Suisse': [],
  'NordicBet Liga': [],
  'Superettan': [],
  'OBOS-ligaen': [],
  'Veikkausliiga': [],
  'Prva Liga Serbie': [],
  'Erste Liga Autriche': [],
  'TFF 1. Lig': [],
  'K League 2': [],
  'I-League': [],
  'USL Championship': [],
  'Canadian Premier League': [],
  'Botola 2 Maroc': [],
  'A-League Women': [],
  'Autre': [],
};

// ── Derived exports ──────────────────────────────────────────────────

/** Map club name → league name (built from LEAGUE_CLUBS) */
export const CLUB_TO_LEAGUE: Record<string, string> = {};
for (const [league, clubs] of Object.entries(LEAGUE_CLUBS)) {
  for (const club of clubs) {
    CLUB_TO_LEAGUE[club] = league;
  }
}

/** Flat club list, sorted alphabetically */
export const CLUBS_FROM_LEAGUES: string[] = Object.keys(CLUB_TO_LEAGUE).sort((a, b) => a.localeCompare(b, 'fr'));

/** All league names derived from the mapping */
export const LEAGUES_FROM_MAPPING: string[] = Object.keys(LEAGUE_CLUBS).sort((a, b) => a.localeCompare(b, 'fr'));

/**
 * Maps common wrong "league" values (country names, abbreviations) to the correct league name.
 * Used to fix existing player data. Single source: country-to-league.json (shared with server).
 */
import countryToLeagueJson from './country-to-league.json';
export const COUNTRY_TO_LEAGUE: Record<string, string> = countryToLeagueJson;
