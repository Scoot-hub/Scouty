// Proxy TheSportsDB calls through our server to avoid CORS issues
const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
const STORAGE_KEY = 'scouthub_session';

// Rate-limit circuit breaker: stop all requests until cooldown expires
let rateLimitedUntil = 0;
const RATE_LIMIT_COOLDOWN = 60_000; // 60s cooldown on 429
const PER_REQUEST_DELAY = 1500; // 1.5s between each API call

function delayMs(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function sportsDbFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  // If rate-limited, bail immediately
  if (Date.now() < rateLimitedUntil) {
    throw new Error('TheSportsDB rate limited — cooling down');
  }

  await delayMs(PER_REQUEST_DELAY);

  const session = localStorage.getItem(STORAGE_KEY);
  const token = session ? JSON.parse(session)?.access_token : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}/functions/thesportsdb-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ endpoint, params }),
  });
  if (response.status === 429 || response.status === 502) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
    throw new Error('TheSportsDB rate limited');
  }
  if (!response.ok) throw new Error(`TheSportsDB proxy HTTP ${response.status}`);
  return response.json();
}

// Mapping des noms de clubs → noms de recherche TheSportsDB
const CLUB_NAME_MAP: Record<string, string[]> = {
  // France
  'Paris Saint-Germain': ['Paris SG', 'Paris Saint-Germain', 'Paris Saint Germain'],
  'Olympique de Marseille': ['Marseille', 'Olympique Marseille'],
  'Olympique Lyonnais': ['Lyon', 'Olympique Lyonnais'],
  'AS Monaco': ['AS Monaco'],
  'LOSC Lille': ['Lille', 'LOSC Lille'],
  'Stade Rennais': ['Rennes', 'Stade Rennais'],
  'OGC Nice': ['OGC Nice', 'Nice'],
  'RC Lens': ['RC Lens', 'Lens'],
  'Stade Brestois': ['Stade Brestois', 'Brest'],
  'RC Strasbourg': ['RC Strasbourg', 'Strasbourg'],
  'Montpellier HSC': ['Montpellier'],
  'FC Nantes': ['FC Nantes', 'Nantes'],
  'Toulouse FC': ['Toulouse'],
  'Stade de Reims': ['Stade de Reims', 'Reims'],
  'Le Havre AC': ['Le Havre'],
  'AJ Auxerre': ['Auxerre', 'AJ Auxerre'],
  'AS Saint-Étienne': ['Saint-Etienne', 'AS Saint-Etienne', 'ASSE', 'St Etienne', 'St Étienne', 'AS Saint-Étienne'],
  'Angers SCO': ['Angers'],
  'FC Metz': ['FC Metz', 'Metz'],
  'SM Caen': ['SM Caen', 'Caen'],
  'Paris FC': ['Paris FC'],
  'ES Troyes AC': ['Troyes'],
  'FC Lorient': ['FC Lorient', 'Lorient'],
  'Amiens SC': ['Amiens'],
  'Grenoble Foot': ['Grenoble Foot 38', 'Grenoble'],
  'Rodez AF': ['Rodez'],
  'USL Dunkerque': ['Dunkerque'],
  'SC Bastia': ['Bastia', 'SC Bastia'],
  'Red Star FC': ['Red Star FC'],
  'FC Martigues': ['FC Martigues'],
  // Angleterre
  'Manchester City': ['Manchester City'],
  'Arsenal': ['Arsenal'],
  'Liverpool': ['Liverpool'],
  'Chelsea': ['Chelsea'],
  'Manchester United': ['Manchester United'],
  'Tottenham Hotspur': ['Tottenham'],
  'Newcastle United': ['Newcastle'],
  'Aston Villa': ['Aston Villa'],
  'West Ham United': ['West Ham'],
  'Brighton & Hove Albion': ['Brighton and Hove Albion', 'Brighton Hove Albion'],
  'Crystal Palace': ['Crystal Palace'],
  'Wolverhampton Wanderers': ['Wolverhampton Wanderers', 'Wolves'],
  'Fulham': ['Fulham'],
  'Everton': ['Everton'],
  'Brentford': ['Brentford'],
  'Nottingham Forest': ['Nottingham Forest'],
  'Bournemouth': ['Bournemouth'],
  'Southampton': ['Southampton'],
  'Leicester City': ['Leicester City', 'Leicester'],
  'Ipswich Town': ['Ipswich Town', 'Ipswich'],
  'Leeds United': ['Leeds United', 'Leeds'],
  'Burnley': ['Burnley'],
  'Sheffield United': ['Sheffield United'],
  'Sunderland': ['Sunderland'],
  'Middlesbrough': ['Middlesbrough'],
  'West Bromwich Albion': ['West Bromwich Albion', 'West Brom'],
  'Norwich City': ['Norwich City', 'Norwich'],
  'Coventry City': ['Coventry City'],
  'Stoke City': ['Stoke City'],
  'Watford': ['Watford'],
  // Espagne
  'Real Madrid': ['Real Madrid'],
  'FC Barcelona': ['Barcelona'],
  'Atlético de Madrid': ['Atletico Madrid'],
  'Real Sociedad': ['Real Sociedad'],
  'Real Betis': ['Real Betis'],
  'Villarreal CF': ['Villarreal'],
  'Athletic Club': ['Athletic Bilbao'],
  'Sevilla FC': ['Sevilla'],
  'Valencia CF': ['Valencia'],
  'Girona FC': ['Girona'],
  'RC Celta de Vigo': ['Celta de Vigo', 'Celta Vigo'],
  'RCD Mallorca': ['Mallorca', 'RCD Mallorca'],
  'Getafe CF': ['Getafe'],
  'Rayo Vallecano': ['Rayo Vallecano'],
  'CA Osasuna': ['Osasuna'],
  'UD Las Palmas': ['Las Palmas'],
  'Deportivo Alavés': ['Deportivo Alaves', 'Alaves'],
  'Cádiz CF': ['Cadiz'],
  'Granada CF': ['Granada CF', 'Granada'],
  'RCD Espanyol': ['Espanyol'],
  // Italie
  'Inter Milan': ['Inter Milan', 'Internazionale'],
  'AC Milan': ['AC Milan', 'Milan'],
  'Juventus': ['Juventus'],
  'SSC Napoli': ['Napoli'],
  'AS Roma': ['AS Roma', 'Roma'],
  'SS Lazio': ['Lazio'],
  'Atalanta BC': ['Atalanta'],
  'ACF Fiorentina': ['Fiorentina'],
  'Bologna FC': ['Bologna'],
  'Torino FC': ['Torino'],
  'Udinese Calcio': ['Udinese'],
  'Genoa CFC': ['Genoa'],
  'US Sassuolo': ['Sassuolo'],
  'Hellas Verona': ['Hellas Verona', 'Verona'],
  'Cagliari Calcio': ['Cagliari'],
  'Empoli FC': ['Empoli'],
  'US Lecce': ['Lecce'],
  'Frosinone Calcio': ['Frosinone'],
  'Salernitana': ['Salernitana'],
  'Como 1907': ['Como 1907', 'Como'],
  'Parma Calcio': ['Parma'],
  'Venezia FC': ['Venezia'],
  'US Cremonese': ['Cremonese'],
  'Brescia Calcio': ['Brescia'],
  // Allemagne
  'Bayern Munich': ['Bayern Munich', 'FC Bayern Munich'],
  'Borussia Dortmund': ['Borussia Dortmund'],
  'RB Leipzig': ['RB Leipzig'],
  'Bayer Leverkusen': ['Bayer Leverkusen'],
  'VfB Stuttgart': ['VfB Stuttgart', 'Stuttgart'],
  'Eintracht Frankfurt': ['Eintracht Frankfurt'],
  'VfL Wolfsburg': ['VfL Wolfsburg', 'Wolfsburg'],
  'SC Freiburg': ['SC Freiburg', 'Freiburg'],
  'Borussia Mönchengladbach': ['Borussia Monchengladbach', 'Gladbach'],
  'TSG Hoffenheim': ['TSG Hoffenheim', 'Hoffenheim'],
  '1. FC Union Berlin': ['Union Berlin', 'FC Union Berlin'],
  'Werder Bremen': ['Werder Bremen'],
  'FC Augsburg': ['FC Augsburg', 'Augsburg'],
  '1. FC Heidenheim': ['1. FC Heidenheim', 'Heidenheim'],
  'SV Darmstadt 98': ['SV Darmstadt 98', 'Darmstadt'],
  '1. FC Köln': ['FC Cologne', 'FC Koln', '1. FC Koln'],
  'FC St. Pauli': ['FC St. Pauli', 'St Pauli'],
  'Hertha BSC': ['Hertha Berlin', 'Hertha BSC'],
  'Hamburger SV': ['Hamburger SV', 'Hamburg'],
  'Fortuna Düsseldorf': ['Fortuna Dusseldorf'],
  'Hannover 96': ['Hannover 96'],
  'Karlsruher SC': ['Karlsruher SC'],
  '1. FC Nürnberg': ['1. FC Nurnberg', 'FC Nurnberg', 'Nurnberg'],
  'FC Schalke 04': ['Schalke 04', 'FC Schalke 04'],
  // Portugal
  'SL Benfica': ['Benfica'],
  'FC Porto': ['FC Porto', 'Porto'],
  'Sporting CP': ['Sporting CP', 'Sporting Lisbon'],
  'SC Braga': ['SC Braga', 'Braga'],
  'Vitória SC': ['Vitoria de Guimaraes', 'Vitoria Guimaraes'],
  'CF Os Belenenses': ['Belenenses'],
  'Gil Vicente FC': ['Gil Vicente'],
  'Rio Ave FC': ['Rio Ave'],
  'Boavista FC': ['Boavista'],
  'Casa Pia AC': ['Casa Pia'],
  'Moreirense FC': ['Moreirense'],
  'Estrela da Amadora': ['Estrela Amadora', 'Estrela da Amadora'],
  'Arouca': ['Arouca'],
  'Famalicão': ['Famalicao'],
  'Estoril Praia': ['Estoril'],
  // Pays-Bas
  'Ajax Amsterdam': ['Ajax'],
  'PSV Eindhoven': ['PSV Eindhoven', 'PSV'],
  'Feyenoord Rotterdam': ['Feyenoord'],
  'AZ Alkmaar': ['AZ Alkmaar', 'AZ'],
  'FC Twente': ['FC Twente', 'Twente'],
  'FC Utrecht': ['FC Utrecht', 'Utrecht'],
  'Vitesse Arnhem': ['Vitesse'],
  'SC Heerenveen': ['SC Heerenveen', 'Heerenveen'],
  'FC Groningen': ['FC Groningen', 'Groningen'],
  'Sparta Rotterdam': ['Sparta Rotterdam'],
  'NEC Nijmegen': ['NEC Nijmegen', 'NEC'],
  'Go Ahead Eagles': ['Go Ahead Eagles'],
  'Fortuna Sittard': ['Fortuna Sittard'],
  'RKC Waalwijk': ['RKC Waalwijk'],
  'PEC Zwolle': ['PEC Zwolle'],
  'Heracles Almelo': ['Heracles Almelo', 'Heracles'],
  'Willem II': ['Willem II'],
  'Excelsior Rotterdam': ['Excelsior'],
  'FC Volendam': ['FC Volendam', 'Volendam'],
  // Belgique
  'Club Brugge': ['Club Brugge', 'FC Bruges', 'Club Bruges', 'Club NXT'],
  'RSC Anderlecht': ['Anderlecht', 'RSC Anderlecht'],
  'Royal Antwerp FC': ['Royal Antwerp', 'Antwerp FC', 'Anvers'],
  'KRC Genk': ['Genk', 'KRC Genk'],
  'KAA Gent': ['KAA Gent', 'Gent', 'KAA La Gantoise', 'La Gantoise', 'Gantoise'],
  'Standard de Liège': ['Standard Liege', 'Standard de Liege', 'Standard Liège'],
  'Union Saint-Gilloise': ['Union Saint-Gilloise', 'Union SG', 'Union St-Gilloise', 'Royale Union Saint-Gilloise'],
  'Cercle Brugge': ['Cercle Brugge', 'Cercle Bruges'],
  'OH Leuven': ['OH Leuven', 'OH Louvain', 'Oud-Heverlee Leuven', 'Oud-Heverlee Louvain'],
  'KV Mechelen': ['KV Mechelen', 'KV Malines', 'Malines'],
  'KV Kortrijk': ['KV Kortrijk', 'KV Courtrai', 'Courtrai'],
  'Charleroi SC': ['Sporting Charleroi', 'Charleroi'],
  'Westerlo': ['Westerlo'],
  'Sint-Truidense VV': ['Sint-Truiden', 'Sint-Truidense', 'Saint-Trond', 'VV Saint-Trond'],
  'RWDM': ['RWDM', 'RWD Molenbeek'],
  'FCV Dender': ['Dender', 'FCV Dender EH'],
  'Beerschot VA': ['Beerschot'],
  // Turquie
  'Galatasaray': ['Galatasaray'],
  'Fenerbahçe': ['Fenerbahce'],
  'Beşiktaş': ['Besiktas'],
  'Trabzonspor': ['Trabzonspor'],
  'İstanbul Başakşehir': ['Istanbul Basaksehir'],
  'Adana Demirspor': ['Adana Demirspor'],
  'Antalyaspor': ['Antalyaspor'],
  'Kayserispor': ['Kayserispor'],
  'Konyaspor': ['Konyaspor'],
  'Alanyaspor': ['Alanyaspor'],
  'Sivasspor': ['Sivasspor'],
  'Gaziantep FK': ['Gaziantep FK', 'Gaziantep'],
  'Hatayspor': ['Hatayspor'],
  'Kasımpaşa': ['Kasimpasa'],
  'Rizespor': ['Caykur Rizespor', 'Rizespor'],
  // Suisse
  'BSC Young Boys': ['BSC Young Boys', 'Young Boys'],
  'FC Bâle': ['FC Basel', 'Basel'],
  'FC Zurich': ['FC Zurich'],
  'Servette FC': ['Servette'],
  'FC Lugano': ['FC Lugano'],
  'FC St. Gallen': ['FC St. Gallen', 'St Gallen'],
  'FC Lucerne': ['FC Luzern', 'Luzern'],
  'Grasshopper Club Zurich': ['Grasshoppers', 'Grasshopper Club'],
  'FC Sion': ['FC Sion'],
  'Lausanne-Sport': ['Lausanne-Sport', 'Lausanne'],
  // Danemark
  'FC Copenhague': ['FC Copenhagen', 'Copenhagen'],
  'FC Midtjylland': ['FC Midtjylland', 'Midtjylland'],
  'Bröndby IF': ['Brondby IF', 'Brondby'],
  'FC Nordsjælland': ['FC Nordsjaelland', 'Nordsjaelland'],
  'Silkeborg IF': ['Silkeborg IF', 'Silkeborg'],
  'Aarhus GF': ['Aarhus GF', 'AGF'],
  'AaB Aalborg': ['AaB', 'Aalborg'],
  'Viborg FF': ['Viborg FF', 'Viborg'],
  'Randers FC': ['Randers FC'],
  'Odense BK': ['Odense BK', 'Odense'],
  // Suède
  'Malmö FF': ['Malmo FF'],
  'AIK': ['AIK'],
  'Djurgårdens IF': ['Djurgardens IF', 'Djurgarden'],
  'Hammarby IF': ['Hammarby IF', 'Hammarby'],
  'IF Elfsborg': ['IF Elfsborg', 'Elfsborg'],
  'IFK Göteborg': ['IFK Goteborg'],
  'IFK Norrköping': ['IFK Norrkoping'],
  'BK Häcken': ['BK Hacken', 'Hacken'],
  'Kalmar FF': ['Kalmar FF'],
  'Helsingborgs IF': ['Helsingborgs IF', 'Helsingborg'],
  // Norvège
  'Rosenborg BK': ['Rosenborg'],
  'Molde FK': ['Molde FK', 'Molde'],
  'FK Bodø/Glimt': ['Bodo Glimt', 'FK Bodø/Glimt'],
  'Vålerenga IF': ['Valerenga', 'Valerenga IF'],
  'Viking FK': ['Viking FK'],
  'Lillestrøm SK': ['Lillestrom SK', 'Lillestrom'],
  'Brann Bergen': ['SK Brann', 'Brann'],
  'Sarpsborg 08': ['Sarpsborg 08'],
  'Stabæk IF': ['Stabaek IF', 'Stabaek'],
  'Tromsø IL': ['Tromso IL', 'Tromso'],
  // Autriche
  'RB Salzbourg': ['Red Bull Salzburg', 'FC Salzburg'],
  'SK Rapid Wien': ['Rapid Vienna', 'Rapid Wien'],
  'SK Sturm Graz': ['Sturm Graz'],
  'LASK': ['LASK', 'LASK Linz'],
  'Wolfsberger AC': ['Wolfsberger AC'],
  'FK Austria Wien': ['FK Austria Wien', 'Austria Vienna'],
  'TSV Hartberg': ['TSV Hartberg', 'Hartberg'],
  'SCR Altach': ['SCR Altach', 'Altach'],
  'SV Ried': ['SV Ried'],
  // Serbie
  'Étoile Rouge de Belgrade': ['Red Star Belgrade', 'Crvena Zvezda'],
  'Partizan Belgrade': ['Partizan Belgrade', 'Partizan'],
  'FK Vojvodina': ['FK Vojvodina', 'Vojvodina'],
  'FK Čukarički': ['FK Cukaricki', 'Cukaricki'],
  'FK TSC Bačka Topola': ['TSC Backa Topola'],
  // Croatie
  'Dinamo Zagreb': ['Dinamo Zagreb'],
  'Hajduk Split': ['Hajduk Split'],
  'NK Osijek': ['NK Osijek', 'Osijek'],
  'Rijeka': ['HNK Rijeka', 'Rijeka'],
  'Lokomotiva Zagreb': ['Lokomotiva Zagreb'],
  // Grèce
  'Olympiacos Le Pirée': ['Olympiacos', 'Olympiakos'],
  'Panathinaikos': ['Panathinaikos'],
  'AEK Athènes': ['AEK Athens'],
  'PAOK Thessalonique': ['PAOK Thessaloniki', 'PAOK'],
  'Aris Thessalonique': ['Aris Thessaloniki', 'Aris'],
  // Ukraine
  'Shakhtar Donetsk': ['Shakhtar Donetsk', 'Shaktar Donetsk'],
  'Dynamo Kyiv': ['Dynamo Kyiv', 'Dynamo Kiev'],
  'Zorya Luhansk': ['Zorya Luhansk'],
  'SC Dnipro-1': ['SC Dnipro-1', 'Dnipro'],
  // Géorgie
  'Dinamo Tbilissi': ['Dinamo Tbilisi'],
  'Dinamo Batumi': ['Dinamo Batumi'],
  'FC Torpedo Kutaisi': ['Torpedo Kutaisi'],
  // Russie
  'Zenit Saint-Pétersbourg': ['Zenit St Petersburg', 'Zenit'],
  'CSKA Moscou': ['CSKA Moscow'],
  'Spartak Moscou': ['Spartak Moscow'],
  'Lokomotiv Moscou': ['Lokomotiv Moscow'],
  // Pologne
  'Legia Varsovie': ['Legia Warsaw', 'Legia Warszawa'],
  'Lech Poznań': ['Lech Poznan'],
  'Raków Częstochowa': ['Rakow Czestochowa'],
  'Jagiellonia Białystok': ['Jagiellonia Bialystok', 'Jagiellonia'],
  // Roumanie
  'FCSB': ['FCSB', 'Steaua Bucuresti'],
  'CFR Cluj': ['CFR Cluj'],
  'Universitatea Craiova': ['Universitatea Craiova'],
  'Rapid Bucarest': ['Rapid Bucuresti', 'Rapid Bucharest'],
  // Tchéquie
  'Sparta Prague': ['Sparta Prague', 'Sparta Praha'],
  'Slavia Prague': ['Slavia Prague', 'Slavia Praha'],
  'FC Viktoria Plzeň': ['Viktoria Plzen'],
  'SK Sigma Olomouc': ['Sigma Olomouc'],
  // Hongrie
  'Ferencvárosi TC': ['Ferencvaros', 'Ferencvarosi TC'],
  'MOL Fehérvár FC': ['MOL Fehervar', 'Fehervar'],
  'Puskás Akadémia FC': ['Puskas Akademia'],
  // Brésil
  'Flamengo': ['Flamengo'],
  'Palmeiras': ['Palmeiras'],
  'São Paulo FC': ['Sao Paulo'],
  'Santos FC': ['Santos'],
  'Corinthians': ['Corinthians'],
  'Fluminense': ['Fluminense'],
  'Botafogo': ['Botafogo'],
  'Atlético Mineiro': ['Atletico Mineiro'],
  'Cruzeiro': ['Cruzeiro'],
  'Internacional': ['Internacional'],
  'Grêmio': ['Gremio'],
  'Vasco da Gama': ['Vasco da Gama'],
  'Bahia': ['Bahia'],
  'Fortaleza EC': ['Fortaleza'],
  'Red Bull Bragantino': ['Red Bull Bragantino', 'Bragantino'],
  'Athletico Paranaense': ['Athletico Paranaense'],
  'Sport Recife': ['Sport Recife'],
  'Coritiba FC': ['Coritiba'],
  'Goiás EC': ['Goias'],
  'Cuiabá EC': ['Cuiaba'],
  // Argentine
  'Boca Juniors': ['Boca Juniors'],
  'River Plate': ['River Plate'],
  'Racing Club': ['Racing Club'],
  'Independiente': ['Independiente'],
  'San Lorenzo': ['San Lorenzo'],
  'Vélez Sarsfield': ['Velez Sarsfield'],
  'Estudiantes de La Plata': ['Estudiantes de La Plata', 'Estudiantes'],
  'Lanús': ['Lanus'],
  'Defensa y Justicia': ['Defensa y Justicia'],
  'Talleres de Córdoba': ['Talleres Cordoba', 'Talleres'],
  'Rosario Central': ['Rosario Central'],
  "Newell's Old Boys": ["Newells Old Boys"],
  'Argentinos Juniors': ['Argentinos Juniors'],
  // Colombie
  'Atlético Nacional': ['Atletico Nacional'],
  'Millonarios FC': ['Millonarios'],
  'América de Cali': ['America de Cali'],
  'Junior de Barranquilla': ['Junior FC', 'Junior Barranquilla'],
  'Deportivo Cali': ['Deportivo Cali'],
  'Independiente Santa Fe': ['Independiente Santa Fe', 'Santa Fe'],
  'Once Caldas': ['Once Caldas'],
  // Uruguay
  'Club Nacional de Football': ['Nacional Montevideo', 'Club Nacional'],
  'CA Peñarol': ['Penarol'],
  'Montevideo Wanderers': ['Montevideo Wanderers'],
  'Defensor Sporting': ['Defensor Sporting'],
  // Mexique
  'Club América': ['Club America', 'America'],
  'CF Monterrey': ['CF Monterrey', 'Monterrey'],
  'Chivas Guadalajara': ['CD Guadalajara', 'Guadalajara Chivas'],
  'Cruz Azul': ['Cruz Azul'],
  'UNAM Pumas': ['Pumas UNAM', 'Club Universidad Nacional'],
  'Tigres UANL': ['Tigres UANL', 'Tigres'],
  'Toluca FC': ['Toluca'],
  'Santos Laguna': ['Santos Laguna'],
  'León': ['Club Leon', 'Leon'],
  'Pachuca': ['Pachuca'],
  // USA / Canada
  'LA Galaxy': ['LA Galaxy'],
  'Inter Miami CF': ['Inter Miami'],
  'Atlanta United FC': ['Atlanta United'],
  'LAFC': ['Los Angeles FC', 'LAFC'],
  'Seattle Sounders FC': ['Seattle Sounders'],
  'New York City FC': ['New York City FC'],
  'New York Red Bulls': ['New York Red Bulls'],
  'Toronto FC': ['Toronto FC'],
  'CF Montréal': ['CF Montreal'],
  'Vancouver Whitecaps': ['Vancouver Whitecaps'],
  'Austin FC': ['Austin FC'],
  'Nashville SC': ['Nashville SC'],
  'Charlotte FC': ['Charlotte FC'],
  'FC Cincinnati': ['FC Cincinnati'],
  'Columbus Crew': ['Columbus Crew'],
  // Maroc
  'Wydad AC': ['Wydad Casablanca', 'Wydad AC'],
  'Raja Casablanca': ['Raja Casablanca'],
  'AS FAR Rabat': ['AS FAR', 'FAR Rabat'],
  'FUS de Rabat': ['FUS Rabat'],
  'RS Berkane': ['RS Berkane', 'Renaissance Berkane'],
  'Maghreb de Fès': ['Maghreb Fes', 'Maghreb de Fes'],
  'Renaissance Zemamra': ['Renaissance Zemamra'],
  'Hassania dAgadir': ['Hassania Agadir'],
  'Olympique de Khouribga': ['Olympique Khouribga'],
  // Algérie
  'USM Alger': ['USM Alger'],
  'MC Alger': ['MC Alger'],
  'JS Kabylie': ['JS Kabylie'],
  'CR Belouizdad': ['CR Belouizdad'],
  'ES Sétif': ['ES Setif'],
  // Tunisie
  'Espérance de Tunis': ['Esperance de Tunis', 'Esperance Tunis'],
  'Club Africain': ['Club Africain'],
  'Étoile du Sahel': ['Etoile du Sahel'],
  'CS Sfaxien': ['CS Sfaxien'],
  'US Monastir': ['US Monastir'],
  // Égypte
  'Al Ahly SC': ['Al Ahly'],
  'Zamalek SC': ['Zamalek'],
  'Pyramids FC': ['Pyramids FC'],
  'Al Masry': ['Al Masry'],
  'Ismaily SC': ['Ismaily'],
  // Nigeria
  'Enyimba FC': ['Enyimba'],
  'Kano Pillars': ['Kano Pillars'],
  'Rangers International': ['Enugu Rangers'],
  'Lobi Stars': ['Lobi Stars'],
  // Cameroun
  'Canon Yaoundé': ['Canon Yaounde'],
  'Coton Sport': ['Cotonsport Garoua', 'Coton Sport'],
  'Union Douala': ['Union Douala'],
  'Tonnerre Yaoundé': ['Tonnerre Yaounde'],
  // Sénégal
  'ASC Jaraaf': ['ASC Jaraaf'],
  'Casa Sports': ['Casa Sports'],
  'US Gorée': ['US Goree'],
  'AS Douanes': ['AS Douanes'],
  // Côte d'Ivoire
  'ASEC Mimosas': ['ASEC Mimosas'],
  'Africa Sports': ['Africa Sports'],
  'Stade dAbidjan': ['Stade Abidjan'],
  // RD Congo
  'TP Mazembe': ['TP Mazembe'],
  'AS Vita Club': ['AS Vita Club'],
  'DC Motema Pembe': ['DC Motema Pembe'],
  // Afrique du Sud
  'Kaizer Chiefs': ['Kaizer Chiefs'],
  'Orlando Pirates': ['Orlando Pirates'],
  'Mamelodi Sundowns': ['Mamelodi Sundowns'],
  'Cape Town City': ['Cape Town City'],
  // Arabie Saoudite
  'Al-Hilal': ['Al Hilal Saudi', 'Al Hilal'],
  'Al-Nassr': ['Al Nassr'],
  'Al-Ittihad': ['Al Ittihad'],
  'Al-Ahli': ['Al Ahli Saudi', 'Al Ahli Jeddah'],
  'Al-Shabab': ['Al Shabab FC'],
  'Al-Ettifaq': ['Al Ettifaq'],
  'Al-Fateh': ['Al Fateh'],
  // Qatar
  'Al-Sadd SC': ['Al Sadd'],
  'Al-Duhail SC': ['Al Duhail'],
  'Al-Rayyan SC': ['Al Rayyan'],
  'Al-Gharafa SC': ['Al Gharafa'],
  // EAU
  'Al-Ain FC': ['Al Ain'],
  'Al-Wahda': ['Al Wahda Abu Dhabi', 'Al Wahda'],
  'Shabab Al-Ahli': ['Shabab Al Ahli'],
  'Al-Jazira': ['Al Jazira'],
  'Al-Wasl': ['Al Wasl'],
  // Iran
  'Persepolis FC': ['Persepolis'],
  'Esteghlal FC': ['Esteghlal'],
  'Sepahan FC': ['Sepahan'],
  'Tractor FC': ['Tractor SC', 'Tractor'],
  // Japon
  'Vissel Kobe': ['Vissel Kobe'],
  'Yokohama F. Marinos': ['Yokohama F. Marinos', 'Yokohama Marinos'],
  'Kawasaki Frontale': ['Kawasaki Frontale'],
  'Urawa Red Diamonds': ['Urawa Red Diamonds', 'Urawa Reds'],
  'FC Tokyo': ['FC Tokyo'],
  'Kashima Antlers': ['Kashima Antlers'],
  'Gamba Osaka': ['Gamba Osaka'],
  'Cerezo Osaka': ['Cerezo Osaka'],
  'Nagoya Grampus': ['Nagoya Grampus'],
  // Corée du Sud
  'Jeonbuk Hyundai Motors': ['Jeonbuk Hyundai Motors', 'Jeonbuk Motors'],
  'Ulsan Hyundai': ['Ulsan Hyundai', 'Ulsan HD'],
  'FC Seoul': ['FC Seoul'],
  'Pohang Steelers': ['Pohang Steelers'],
  // Chine
  'Shanghai Port': ['Shanghai Port', 'Shanghai SIPG'],
  'Guangzhou FC': ['Guangzhou FC', 'Guangzhou Evergrande'],
  'Shandong Taishan': ['Shandong Taishan', 'Shandong Luneng'],
  'Beijing Guoan': ['Beijing Guoan'],
  // Australie
  'Melbourne Victory': ['Melbourne Victory'],
  'Sydney FC': ['Sydney FC'],
  'Melbourne City': ['Melbourne City'],
  'Western Sydney Wanderers': ['Western Sydney Wanderers'],
  'Adelaide United': ['Adelaide United'],
  'Perth Glory': ['Perth Glory'],
  'Brisbane Roar': ['Brisbane Roar'],
  'Wellington Phoenix': ['Wellington Phoenix'],
  'Macarthur FC': ['Macarthur FC'],
  'Central Coast Mariners': ['Central Coast Mariners'],
  // Espagne - La Liga 2
  'Levante UD': ['Levante UD', 'Levante'],
  'Real Valladolid': ['Real Valladolid', 'Valladolid'],
  'SD Huesca': ['SD Huesca', 'Huesca'],
  'Sporting de Gijón': ['Sporting Gijon'],
  'UD Almería': ['UD Almeria', 'Almeria'],
  'Real Zaragoza': ['Real Zaragoza', 'Zaragoza'],
  'SD Eibar': ['SD Eibar', 'Eibar'],
  'Elche CF': ['Elche CF', 'Elche'],
  'CD Leganés': ['CD Leganes', 'Leganes'],
  'Racing de Santander': ['Racing Santander'],
  'Burgos CF': ['Burgos CF'],
  'Albacete BP': ['Albacete BP', 'Albacete'],
  'Deportivo de La Coruña': ['Deportivo La Coruna', 'Deportivo de La Coruna'],
  'Málaga CF': ['Malaga CF', 'Malaga'],
  'CD Mirandés': ['CD Mirandes'],
  'FC Cartagena': ['FC Cartagena'],
  'Real Oviedo': ['Real Oviedo', 'Oviedo'],
  'CD Tenerife': ['CD Tenerife', 'Tenerife'],
  // Italie - Serie B
  'Palermo FC': ['Palermo'],
  'US Catanzaro': ['Catanzaro'],
  'Sampdoria': ['Sampdoria'],
  'Spezia Calcio': ['Spezia'],
  'Bari': ['SSC Bari', 'Bari'],
  'Pisa SC': ['Pisa SC', 'Pisa'],
  'AC Cesena': ['Cesena'],
  'SSD Cosenza Calcio': ['Cosenza'],
  'Juve Stabia': ['SS Juve Stabia', 'Juve Stabia'],
  'AS Cittadella': ['Cittadella'],
  'Südtirol': ['FC Sudtirol', 'Sudtirol'],
  'Carrarese Calcio': ['Carrarese'],
  'Reggiana': ['AC Reggiana', 'Reggiana'],
  'Modena FC': ['Modena'],
  'SPAL': ['SPAL'],
  'Ternana Calcio': ['Ternana'],
  'FC Crotone': ['Crotone'],
  // Angleterre - Championship
  'Swansea City': ['Swansea City', 'Swansea'],
  'Huddersfield Town': ['Huddersfield Town', 'Huddersfield'],
  'Bristol City': ['Bristol City'],
  'Blackburn Rovers': ['Blackburn Rovers', 'Blackburn'],
  'Cardiff City': ['Cardiff City', 'Cardiff'],
  'Millwall': ['Millwall'],
  'Plymouth Argyle': ['Plymouth Argyle', 'Plymouth'],
  'QPR': ['Queens Park Rangers', 'QPR'],
  'Preston North End': ['Preston North End', 'Preston'],
  'Hull City': ['Hull City', 'Hull'],
  'Sheffield Wednesday': ['Sheffield Wednesday'],
  'Derby County': ['Derby County', 'Derby'],
  'Luton Town': ['Luton Town', 'Luton'],
  'Portsmouth FC': ['Portsmouth'],
  'Oxford United': ['Oxford United', 'Oxford'],
  'Birmingham City': ['Birmingham City', 'Birmingham'],
  'Charlton Athletic': ['Charlton Athletic', 'Charlton'],
  'Rotherham United': ['Rotherham United', 'Rotherham'],
  'Exeter City': ['Exeter City'],
  'Peterborough United': ['Peterborough United', 'Peterborough'],
  // Ecosse
  'Celtic FC': ['Celtic'],
  'Rangers FC': ['Rangers', 'Rangers FC', 'Glasgow Rangers'],
  'Heart of Midlothian': ['Heart of Midlothian', 'Hearts'],
  'Hibernian FC': ['Hibernian'],
  'Aberdeen FC': ['Aberdeen'],
  'Motherwell FC': ['Motherwell'],
  'St. Johnstone': ['St Johnstone'],
  'Kilmarnock FC': ['Kilmarnock'],
  'Ross County': ['Ross County'],
  'St. Mirren': ['St Mirren'],
  'Livingston FC': ['Livingston'],
  'Dundee FC': ['Dundee FC', 'Dundee'],
  'Dundee United': ['Dundee United'],
  'Inverness CT': ['Inverness CT', 'Inverness Caledonian Thistle'],
  'Partick Thistle': ['Partick Thistle'],
  'Falkirk FC': ['Falkirk'],
  'Dunfermline Athletic': ['Dunfermline Athletic', 'Dunfermline'],
  'Hamilton Academical': ['Hamilton Academical', 'Hamilton'],
  'Airdrieonians': ['Airdrieonians'],
  'Ayr United': ['Ayr United'],
  "Queen's Park FC": ["Queens Park"],
  'Raith Rovers': ['Raith Rovers'],
  // Portugal Liga 2
  'FC Vizela': ['Vizela'],
  'CD Tondela': ['Tondela'],
  'GD Chaves': ['GD Chaves', 'Chaves'],
  'FC Paços de Ferreira': ['Pacos de Ferreira'],
  'SC Covilhã': ['SC Covilha'],
  'FC Penafiel': ['Penafiel'],
  'CD Feirense': ['Feirense'],
  'Académica de Coimbra': ['Academica de Coimbra', 'Academica Coimbra'],
  'FC Leixões': ['Leixoes'],
  'Académico de Viseu': ['Academico de Viseu', 'Academico Viseu'],
  // Pays-Bas Eerste Divisie
  'NAC Breda': ['NAC Breda', 'NAC'],
  'ADO Den Haag': ['ADO Den Haag'],
  'FC Emmen': ['FC Emmen', 'Emmen'],
  'Almere City FC': ['Almere City FC', 'Almere City'],
  'FC Dordrecht': ['FC Dordrecht', 'Dordrecht'],
  'FC Den Bosch': ['FC Den Bosch', 'Den Bosch'],
  'Roda JC Kerkrade': ['Roda JC', 'Roda JC Kerkrade'],
  'SC Cambuur': ['SC Cambuur', 'Cambuur'],
  // Russie
  'FC Krasnodar': ['FK Krasnodar', 'Krasnodar'],
  'FC Dynamo Moscou': ['Dynamo Moscow', 'Dinamo Moscow'],
  'FK Rostov': ['FK Rostov', 'Rostov'],
  'FC Akhmat Grozny': ['Akhmat Grozny', 'Akhmat'],
  'PFC Krylya Sovetov': ['Krylya Sovetov'],
  'FC Rubin Kazan': ['Rubin Kazan', 'Rubin'],
  'Torpedo Moscou': ['Torpedo Moscow'],
  // Ukraine
  'Metalist Kharkiv': ['Metalist Kharkiv', 'Metalist'],
  'Vorskla Poltava': ['Vorskla Poltava'],
  'Chornomorets Odesa': ['Chernomorets Odessa'],
  'Rukh Lviv': ['Rukh Lviv'],
  // Pologne
  'Zagłębie Lubin': ['Zaglebie Lubin'],
  'Pogoń Szczecin': ['Pogon Szczecin'],
  'Wisła Kraków': ['Wisla Krakow', 'Wisla Kraków'],
  'Śląsk Wrocław': ['Slask Wroclaw'],
  'Cracovia': ['Cracovia Krakow', 'Cracovia'],
  'Górnik Zabrze': ['Gornik Zabrze'],
  'Lechia Gdańsk': ['Lechia Gdansk'],
  'Warta Poznań': ['Warta Poznan'],
  'Piast Gliwice': ['Piast Gliwice'],
  // Roumanie
  'Petrolul Ploiești': ['Petrolul Ploiesti', 'Petrolul'],
  'FC Voluntari': ['FC Voluntari'],
  'Sepsi OSK': ['Sepsi OSK'],
  'Politehnica Iași': ['Politehnica Iasi'],
  'FC Hermannstadt': ['FC Hermannstadt'],
  'FCU Craiova 1948': ['FCU Craiova'],
  // Tchéquie
  'FK Mladá Boleslav': ['FK Mlada Boleslav', 'Mlada Boleslav'],
  'FC Zlín': ['FC Zlin', 'Zlin'],
  'Bohemians 1905': ['Bohemians Prague 1905', 'Bohemians'],
  'FK Teplice': ['FK Teplice', 'Teplice'],
  'FK Jablonec': ['FK Jablonec'],
  'FC Zbrojovka Brno': ['Zbrojovka Brno'],
  'FC Slovácko': ['FC Slovacko', 'Slovacko'],
  // Slovaquie
  'FK Slovan Bratislava': ['Slovan Bratislava'],
  'FK DAC Dunajská Streda': ['DAC Dunajska Streda', 'DAC Dunajska'],
  'MFK Ružomberok': ['MFK Ruzomberok'],
  'FC Spartak Trnava': ['Spartak Trnava'],
  'FK Žilina': ['FK Zilina'],
  // Slovénie
  'NK Olimpija Ljubljana': ['NK Olimpija Ljubljana', 'NK Olimpija'],
  'NK Maribor': ['NK Maribor', 'Maribor'],
  'NK Koper': ['NK Koper'],
  'NK Mura': ['NS Mura', 'NK Mura'],
  'NK Domžale': ['NK Domzale'],
  // Bulgarie
  'PFC CSKA Sofia': ['CSKA Sofia'],
  'PFC Ludogorets Razgrad': ['Ludogorets Razgrad', 'Ludogorets'],
  'PFC Lokomotiv Plovdiv': ['Lokomotiv Plovdiv'],
  'Botev Plovdiv': ['Botev Plovdiv'],
  'FC Levski Sofia': ['Levski Sofia', 'Levski'],
  'PFC Beroe Stara Zagora': ['Beroe Stara Zagora', 'Beroe'],
  // Moldavie
  'FC Sheriff Tiraspol': ['Sheriff Tiraspol', 'Sheriff'],
  // Biélorussie
  'FC BATE Borisov': ['BATE Borisov'],
  'FC Dynamo Minsk': ['Dynamo Minsk'],
  'FC Shakhtar Soligorsk': ['Shakhtar Soligorsk'],
  // États baltes
  'FC Flora Tallinn': ['FC Flora Tallinn', 'Flora Tallinn'],
  'FCI Levadia Tallinn': ['FC Levadia Tallinn', 'Levadia Tallinn'],
  'FK RFS': ['FK RFS'],
  'FK Riga': ['FK Riga'],
  'FK Liepāja': ['FK Liepajas Metalurgs', 'FK Liepajs'],
  'FK Žalgiris': ['FK Zalgiris Vilnius', 'Zalgiris'],
  'FK Sūduva': ['FK Suduva'],
  // Islande
  'KR Reykjavík': ['KR Reykjavik', 'KR'],
  'Breiðablik': ['Breidablik'],
  'Valur Reykjavík': ['Valur Reykjavik', 'Valur'],
  'Víkingur Reykjavík': ['Vikingur Reykjavik'],
  'ÍA Akranes': ['IA Akranes', 'Akranes'],
  'Fram Reykjavík': ['Fram Reykjavik', 'Fram'],
  'FH Hafnarfjörður': ['FH Hafnarfjordur', 'FH'],
  // Irlande
  'Shamrock Rovers': ['Shamrock Rovers'],
  'Bohemian FC': ['Bohemian FC', 'Bohemians Dublin'],
  'Dundalk FC': ['Dundalk FC', 'Dundalk'],
  'Shelbourne FC': ['Shelbourne'],
  "St. Patrick's Athletic": ["St Patricks Athletic", "St Patrick's Athletic"],
  'Cork City FC': ['Cork City'],
  'Derry City FC': ['Derry City'],
  // Chypre
  'APOEL FC': ['APOEL FC', 'APOEL Nicosia'],
  'Omonia Nicosie': ['Omonia Nicosia', 'AC Omonia'],
  'AEL Limassol': ['AEL Limassol'],
  'Apollon Limassol': ['Apollon Limassol'],
  'AEK Larnaca': ['AEK Larnaca'],
  // Arménie
  'FC Pyunik Yerevan': ['FC Pyunik', 'Pyunik Yerevan'],
  'FC Ararat-Armenia': ['Ararat Armenia'],
  'FC Shirak': ['FC Shirak'],
  // Azerbaïdjan
  'FK Qarabağ': ['FK Qarabag', 'Qarabag FK'],
  'Neftchi Bakou': ['Neftchi Baku'],
  'FK Sabah': ['FK Sabah Baku'],
  // Kosovo
  'FC Drita': ['FC Drita'],
  'FC Prishtina': ['FC Prishtina'],
  'FC Ballkani': ['FC Ballkani'],
  // Macédoine du Nord
  'FK Shkupi': ['FK Shkupi'],
  'FK Rabotnički': ['FK Rabotnicki'],
  'FK Vardar': ['FK Vardar'],
  // Albanie
  'FK Partizani Tirana': ['FK Partizani'],
  'FK Vllaznia Shkodër': ['FK Vllaznia'],
  'FK Dinamo Tirana': ['FK Dinamo Tirana'],
  'KF Skënderbeu Korçë': ['KF Skenderbeu'],
  // Bosnie
  'FK Borac Banja Luka': ['FK Borac Banja Luka', 'FK Borac'],
  'FK Sarajevo': ['FK Sarajevo'],
  'FK Zrinjski Mostar': ['FK Zrinjski'],
  'FK Velež Mostar': ['FK Velez'],
  'NK Čelik Zenica': ['NK Celik Zenica', 'NK Celik'],
  // Monténégro
  'FK Budućnost Podgorica': ['FK Buducnost Podgorica', 'FK Buducnost'],
  'FK Sutjeska Nikšić': ['FK Sutjeska'],
  // Chili
  'Colo-Colo': ['Colo Colo', 'Colo-Colo'],
  'Universidad de Chile': ['Universidad de Chile'],
  'Universidad Católica': ['Universidad Católica Santiago', 'CD Universidad Católica'],
  'Huachipato': ['CD Huachipato'],
  'CD Ñublense': ['CD Nublense'],
  'Deportes Antofagasta': ['Deportes Antofagasta'],
  'Everton de Viña del Mar': ['Everton de Vina del Mar', 'Everton Chile'],
  // Pérou
  'Universitario de Deportes': ['Universitario de Deportes', 'Universitario'],
  'Alianza Lima': ['Alianza Lima'],
  'Sporting Cristal': ['Sporting Cristal'],
  'Club FBC Melgar': ['FBC Melgar', 'Melgar'],
  // Équateur
  'Barcelona SC': ['Barcelona SC', 'Barcelona Sporting Club'],
  'LDU de Quito': ['LDU Quito', 'Liga de Quito'],
  'Independiente del Valle': ['Independiente del Valle'],
  'CS Emelec': ['CS Emelec', 'Emelec'],
  'El Nacional': ['El Nacional Ecuador'],
  // Bolivie
  'Club Bolívar': ['Club Bolivar', 'Bolivar'],
  'The Strongest': ['The Strongest'],
  'Club Jorge Wilstermann': ['Club Wilstermann'],
  'Club Always Ready': ['Club Always Ready'],
  // Paraguay
  'Club Olimpia': ['Club Olimpia', 'Olimpia Asuncion'],
  'Cerro Porteño': ['Cerro Porteno'],
  'Club Libertad': ['Club Libertad'],
  'Club Sol de América': ['Club Sol de America'],
  'Club Guaraní': ['Club Guarani'],
  // Venezuela
  'Caracas FC': ['Caracas FC'],
  'Deportivo Táchira': ['Deportivo Tachira'],
  // Amérique centrale
  'Comunicaciones FC': ['Comunicaciones FC'],
  'Municipal FC': ['CSD Municipal', 'Municipal'],
  'CD Olimpia': ['CD Olimpia Honduras', 'Olimpia Honduras'],
  'CD Motagua': ['CD Motagua'],
  'Real CD España': ['Real CD Espana', 'Real Espana'],
  'CD Águila': ['CD Aguila'],
  'FAS El Salvador': ['CD FAS', 'Santa Ana FAS'],
  'Deportivo Saprissa': ['Deportivo Saprissa', 'Saprissa'],
  'Liga Deportiva Alajuelense': ['LD Alajuelense', 'Alajuelense'],
  'CS Herediano': ['CS Herediano', 'Herediano'],
  // Ghana
  'Asante Kotoko': ['Asante Kotoko'],
  'Hearts of Oak': ['Accra Hearts of Oak', 'Hearts of Oak'],
  // Géorgie (plus)
  'FC Saburtalo': ['FC Saburtalo Tbilisi', 'Saburtalo'],
  'FC Guria Lanchkhuti': ['FC Guria'],
  // Arménie
  'FC Banants': ['FC Banants Yerevan'],
  'FC Urartu': ['FC Urartu Yerevan'],
  // Azerbaïdjan (plus)
  'FK Gabala': ['FK Qabal', 'FK Qabala'],
  // Inde
  'ATK Mohun Bagan': ['ATK Mohun Bagan', 'Mohun Bagan'],
  'Bengaluru FC': ['Bengaluru FC'],
  'Mumbai City FC': ['Mumbai City FC'],
  'FC Goa': ['FC Goa'],
  'Hyderabad FC': ['Hyderabad FC'],
  'Kerala Blasters': ['Kerala Blasters FC'],
  'NorthEast United FC': ['NorthEast United FC', 'Northeast United'],
  'Jamshedpur FC': ['Jamshedpur FC'],
  'East Bengal FC': ['East Bengal FC'],
  // Thaïlande
  'Buriram United': ['Buriram United FC', 'Buriram United'],
  'Chiang Rai United': ['Chiangrai United', 'Chiang Rai United'],
  'BG Pathum United': ['BG Pathum United FC', 'PT Prachuap'],
  'Muangthong United': ['Muangthong United'],
  // Vietnam
  'Hanoi FC': ['Hanoi FC'],
  'Becamex Binh Duong': ['Becamex Binh Duong'],
  'Hoang Anh Gia Lai': ['Hoang Anh Gia Lai FC'],
  // Indonésie
  'Persija Jakarta': ['Persija Jakarta'],
  'Persib Bandung': ['Persib Bandung'],
  'Arema FC': ['Arema FC'],
  'PSM Makassar': ['PSM Makassar'],
  'Bali United': ['Bali United FC'],
  // Malaisie
  'Johor Darul Ta\'zim': ['Johor Darul Takzim', 'JDT'],
  'Selangor FA': ['Selangor FA'],
  // Kenya
  'Gor Mahia': ['Gor Mahia FC', 'Gor Mahia'],
  'AFC Leopards': ['AFC Leopards'],
  'Tusker FC': ['Tusker FC'],
  // Tanzanie
  'Simba SC': ['Simba SC'],
  'Young Africans SC': ['Yanga SC', 'Young Africans'],
  'Azam FC': ['Azam FC'],
  // Zimbabwe
  'Dynamos FC': ['Dynamos FC Zimbabwe', 'Dynamos'],
  'CAPS United': ['CAPS United'],
  'FC Platinum': ['FC Platinum'],
  // Zambie
  'Zesco United': ['Zesco United'],
  'Forest Rangers FC': ['Forest Rangers'],
  // Rwanda
  'APR FC': ['APR FC'],
  'Rayon Sports': ['Rayon Sports'],
  // Angola
  'Petro de Luanda': ['Petro de Luanda', 'Petro Atletico'],
  'Primeiro de Agosto': ['Primeiro de Agosto'],
  // Soudan
  'Al Hilal Omdurman': ['Al Hilal Omdurman', 'Al Hilal Sudan'],
  'Al Merrikh': ['Al Merreikh', 'Al Merrikh'],
  // Jordanie
  'Al-Wehdat': ['Al Wehdat', 'Al-Wehdat SC'],
  'Al-Faisaly': ['Al Faisaly FC'],
  // Liban
  'Al-Ahed': ['Al Ahed FC'],
  'Nejmeh SC': ['Nejmeh SC'],
  // Irak
  'Al-Shorta': ['Al Shorta SC'],
  'Al-Zawraa': ['Al Zawraa SC'],
  // Ouzbékistan
  'FC Pakhtakor': ['FC Pakhtakor Tashkent', 'Pakhtakor'],
  'FC Lokomotiv Tashkent': ['FC Lokomotiv Tashkent'],
  'FC Nasaf': ['FC Nasaf Qarshi', 'Nasaf'],
  // Kazakhstan
  'FC Kairat': ['FC Kairat Almaty', 'Kairat'],
  'FC Astana': ['FC Astana', 'FC Astana Kazakhstan'],
  'FC Shakhtar Karagandy': ['FK Shakhter Karagandy', 'Shakhtar Karagandy'],
};

/**
 * Hardcoded badge overrides — used when TheSportsDB returns a wrong/missing badge.
 * Keys are lowercased & diacritic-stripped for resilient matching (see normKey()).
 * Cover all expected variants: official name, typos, French/English/Spanish spellings.
 */
const BADGE_OVERRIDES: Record<string, string> = {
  // Paris Saint-Germain — "Paris Saint-Germain" search returns Aris (Greek club) on TheSportsDB
  'paris saint germain':          'https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1473504808.png',
  'paris saint-germain':          'https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1473504808.png',
  'psg':                          'https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1473504808.png',
  'paris sg':                     'https://r2.thesportsdb.com/images/media/team/badge/rwqrrq1473504808.png',
  // Eintracht Frankfurt — many spelling variants in different languages
  'eintracht frankfurt':          'https://r2.thesportsdb.com/images/media/team/badge/rurwpy1473453269.png',
  'eintracht francfort':          'https://r2.thesportsdb.com/images/media/team/badge/rurwpy1473453269.png',
  'eintracht franckfort':         'https://r2.thesportsdb.com/images/media/team/badge/rurwpy1473453269.png',
  'eintracht frankfort':          'https://r2.thesportsdb.com/images/media/team/badge/rurwpy1473453269.png',
  'sg eintracht frankfurt':       'https://r2.thesportsdb.com/images/media/team/badge/rurwpy1473453269.png',
  // CA Talleres
  'ca talleres':                  'https://r2.thesportsdb.com/images/media/team/badge/7hum2t1769310938.png',
  'talleres':                     'https://r2.thesportsdb.com/images/media/team/badge/7hum2t1769310938.png',
  'club atletico talleres':       'https://r2.thesportsdb.com/images/media/team/badge/7hum2t1769310938.png',
  // FC Dallas
  'fc dallas':                    'https://r2.thesportsdb.com/images/media/team/badge/vxy8xy1602103187.png',
  'dallas':                       'https://r2.thesportsdb.com/images/media/team/badge/vxy8xy1602103187.png',
  // AVS Futebol
  'avs futebol':                  'https://r2.thesportsdb.com/images/media/team/badge/xp8oqb1688676544.png',
  'avs':                          'https://r2.thesportsdb.com/images/media/team/badge/xp8oqb1688676544.png',
  // FC Nürnberg
  'fc nurnberg':                  'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  'fc nürnberg':                  'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  '1 fc nurnberg':                'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  '1 fc nürnberg':                'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  'nurnberg':                     'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  'nürnberg':                     'https://r2.thesportsdb.com/images/media/team/badge/wtj8rd1659904028.png',
  // KSC Lokeren
  'ksc lokeren':                  'https://r2.thesportsdb.com/images/media/team/badge/hq6p011750703695.png',
  'lokeren':                      'https://r2.thesportsdb.com/images/media/team/badge/hq6p011750703695.png',
  'waasland beveren lokeren':     'https://r2.thesportsdb.com/images/media/team/badge/hq6p011750703695.png',
  // FC Saint-Gall / St. Gallen
  'fc saint gall':                'https://r2.thesportsdb.com/images/media/team/badge/tyvyvs1422644512.png',
  'saint gall':                   'https://r2.thesportsdb.com/images/media/team/badge/tyvyvs1422644512.png',
  'st gallen':                    'https://r2.thesportsdb.com/images/media/team/badge/tyvyvs1422644512.png',
  'st  gallen':                   'https://r2.thesportsdb.com/images/media/team/badge/tyvyvs1422644512.png',
  'fc st gallen':                 'https://r2.thesportsdb.com/images/media/team/badge/tyvyvs1422644512.png',
  // Real Salt Lake
  'real salt lake':               'https://r2.thesportsdb.com/images/media/team/badge/kkjlfa1556488022.png',
  'rsl':                          'https://r2.thesportsdb.com/images/media/team/badge/kkjlfa1556488022.png',
  // Istanbul Basaksehir
  'istanbul basaksehir':          'https://r2.thesportsdb.com/images/media/team/badge/895mqt1685993958.png',
  'istanbul basakşehir':          'https://r2.thesportsdb.com/images/media/team/badge/895mqt1685993958.png',
  'basaksehir':                   'https://r2.thesportsdb.com/images/media/team/badge/895mqt1685993958.png',
  'medipol basaksehir':           'https://r2.thesportsdb.com/images/media/team/badge/895mqt1685993958.png',
  // Sevilla / FC Séville
  'sevilla fc':                   'https://r2.thesportsdb.com/images/media/team/badge/vpsqqx1473502977.png',
  'sevilla':                      'https://r2.thesportsdb.com/images/media/team/badge/vpsqqx1473502977.png',
  'fc seville':                   'https://r2.thesportsdb.com/images/media/team/badge/vpsqqx1473502977.png',
  'fc séville':                   'https://r2.thesportsdb.com/images/media/team/badge/vpsqqx1473502977.png',
  'seville':                      'https://r2.thesportsdb.com/images/media/team/badge/vpsqqx1473502977.png',
  // Palermo
  'palermo':                      'https://r2.thesportsdb.com/images/media/team/badge/zi1tb01579708939.png',
  'us citta di palermo':          'https://r2.thesportsdb.com/images/media/team/badge/zi1tb01579708939.png',
  'palermo fc':                   'https://r2.thesportsdb.com/images/media/team/badge/zi1tb01579708939.png',
  // Al-Kholood
  'al kholood':                   'https://r2.thesportsdb.com/images/media/team/badge/vv44v01755192851.png',
  'al-kholood':                   'https://r2.thesportsdb.com/images/media/team/badge/vv44v01755192851.png',
  'al khalood':                   'https://r2.thesportsdb.com/images/media/team/badge/vv44v01755192851.png',
  'kholood':                      'https://r2.thesportsdb.com/images/media/team/badge/vv44v01755192851.png',
};

// Normalize: remove diacritics and special chars for fallback search
function normalizeForSearch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ClubInfo {
  name: string;
  badge_url?: string;
  country?: string;
  league?: string;
}

async function trySearch(searchTerm: string): Promise<ClubInfo | null> {
  try {
    const data = await sportsDbFetch('searchteams', { t: searchTerm });

    if (!data.teams || data.teams.length === 0) return null;

    // Prefer soccer teams
    const soccerTeam = data.teams.find((t: any) => t.strSport === 'Soccer') || data.teams[0];
    return {
      name: soccerTeam.strTeam,
      badge_url: soccerTeam.strBadge || soccerTeam.strTeamBadge,
      country: soccerTeam.strCountry,
      league: soccerTeam.strLeague,
    };
  } catch {
    return null;
  }
}

// Reverse alias map: normalized alias → canonical key (built once at module load)
const ALIAS_TO_KEY = new Map<string, string>();
for (const [key, alts] of Object.entries(CLUB_NAME_MAP)) {
  for (const alt of alts) {
    ALIAS_TO_KEY.set(normalizeForSearch(alt).toLowerCase(), key);
  }
}

export async function searchClubLogo(clubName: string): Promise<ClubInfo | null> {
  const normalizedInput = normalizeForSearch(clubName).toLowerCase();

  // Try mapped names first (exact key match)
  const alternatives = CLUB_NAME_MAP[clubName];
  if (alternatives) {
    for (const alt of alternatives) {
      const result = await trySearch(alt);
      if (result?.badge_url) return result;
    }
  }

  // Try reverse alias lookup (e.g. "Union SG" → "Union Saint-Gilloise" alts)
  const canonicalKey = ALIAS_TO_KEY.get(normalizedInput);
  if (canonicalKey && canonicalKey !== clubName) {
    for (const alt of CLUB_NAME_MAP[canonicalKey]) {
      const result = await trySearch(alt);
      if (result?.badge_url) return result;
    }
  }

  // Try fuzzy match on CLUB_NAME_MAP keys (handle typos/variations)
  for (const [mapKey, alts] of Object.entries(CLUB_NAME_MAP)) {
    const normalizedKey = normalizeForSearch(mapKey).toLowerCase();
    if (normalizedKey === normalizedInput || normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) {
      for (const alt of alts) {
        const result = await trySearch(alt);
        if (result?.badge_url) return result;
      }
    }
    // Also check if input partially matches any alias in the values
    const aliasMatch = alts.some(alt => {
      const normalizedAlt = normalizeForSearch(alt).toLowerCase();
      return normalizedAlt.includes(normalizedInput) || normalizedInput.includes(normalizedAlt);
    });
    if (aliasMatch) {
      for (const alt of alts) {
        const result = await trySearch(alt);
        if (result?.badge_url) return result;
      }
    }
  }

  // Try original name
  const direct = await trySearch(clubName);
  if (direct?.badge_url) return direct;

  // Try normalized name (without diacritics)
  const normalized = normalizeForSearch(clubName);
  if (normalized !== clubName) {
    const normResult = await trySearch(normalized);
    if (normResult?.badge_url) return normResult;
  }

  // Try removing common prefixes/suffixes (FC, SC, CF, AC, etc.)
  const stripped = normalized
    .replace(/^(fc|sc|cf|ac|rc|rcd|afc|ssc|ss|as|us|fk|sk|bk|if|bsc|tsv|vfb|vfl|tsg|sv|1\s*fc)\s+/i, '')
    .replace(/\s+(fc|sc|cf|ac|fk|sk|if|bk)$/i, '')
    .trim();
  if (stripped !== normalized && stripped.length >= 3) {
    const strippedResult = await trySearch(stripped);
    if (strippedResult?.badge_url) return strippedResult;
  }

  // Try each individual word (length >= 4) as a search term — catches "Utrecht", "Nagoya", etc.
  const words = normalized.split(/\s+/).filter(w => w.length >= 4);
  for (const word of words) {
    const wordResult = await trySearch(word);
    if (wordResult?.badge_url) return wordResult;
  }

  return null;
}

// Returns BADGE_OVERRIDES key for a name: lowercase + diacritics stripped
function normKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Returns the hardcoded badge override URL for a club name, if any. */
export function getBadgeOverride(clubName: string): string | null {
  return BADGE_OVERRIDES[normKey(clubName)] ?? null;
}

export async function getClubBadgeUrl(clubName: string): Promise<string | null> {
  // Check hardcoded overrides first (resilient: diacritics + punctuation stripped)
  const override = getBadgeOverride(clubName);
  if (override) return override;

  const info = await searchClubLogo(clubName);
  return info?.badge_url ?? null;
}

/**
 * Returns the canonical/official club name for a given alias or variant.
 * e.g. "Union SG" → "Union Saint-Gilloise", "Charleroi" → "Charleroi SC"
 */
export function resolveClubName(clubName: string): string {
  // Exact key match
  if (CLUB_NAME_MAP[clubName]) return clubName;

  const normalizedInput = normalizeForSearch(clubName).toLowerCase();

  // Reverse alias lookup
  const canonicalKey = ALIAS_TO_KEY.get(normalizedInput);
  if (canonicalKey) return canonicalKey;

  // Fuzzy key match
  for (const [mapKey] of Object.entries(CLUB_NAME_MAP)) {
    const normalizedKey = normalizeForSearch(mapKey).toLowerCase();
    if (normalizedKey === normalizedInput || normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
      return mapKey;
    }
  }

  return clubName;
}
