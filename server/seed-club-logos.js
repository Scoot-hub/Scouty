/**
 * seed-club-logos.js
 * Populates the club_logos table by fetching badge URLs from TheSportsDB.
 * Usage: node server/seed-club-logos.js
 * Resumable: skips clubs already stored in the DB.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDbPoolConfig } from './db-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const DELAY_MS = 420; // stay well within free-tier limits

// ── Mapping: canonical name → TheSportsDB search terms ─────────────────────
const CLUB_NAME_MAP = {
  // France
  'Paris Saint-Germain': ['Paris Saint-Germain'],
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
  'CD Leganés': ['CD Leganes', 'Leganes'],
  'RCD Espanyol': ['Espanyol'],
  'Real Valladolid': ['Real Valladolid', 'Valladolid'],
  'Levante UD': ['Levante UD', 'Levante'],
  'SD Huesca': ['SD Huesca', 'Huesca'],
  'Sporting de Gijón': ['Sporting Gijon'],
  'UD Almería': ['UD Almeria', 'Almeria'],
  'Real Zaragoza': ['Real Zaragoza', 'Zaragoza'],
  'SD Eibar': ['SD Eibar', 'Eibar'],
  'Elche CF': ['Elche CF', 'Elche'],
  'Racing de Santander': ['Racing Santander'],
  'Burgos CF': ['Burgos CF'],
  'Albacete BP': ['Albacete BP', 'Albacete'],
  'Deportivo de La Coruña': ['Deportivo La Coruna'],
  'Málaga CF': ['Malaga CF', 'Malaga'],
  'CD Mirandés': ['CD Mirandes'],
  'FC Cartagena': ['FC Cartagena'],
  'Real Oviedo': ['Real Oviedo', 'Oviedo'],
  'CD Tenerife': ['CD Tenerife', 'Tenerife'],
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
  'Hellas Verona': ['Hellas Verona', 'Verona'],
  'Cagliari Calcio': ['Cagliari'],
  'Empoli FC': ['Empoli'],
  'US Lecce': ['Lecce'],
  'Como 1907': ['Como 1907', 'Como'],
  'Parma Calcio': ['Parma'],
  'Venezia FC': ['Venezia'],
  'AC Monza': ['Monza'],
  'Palermo FC': ['Palermo'],
  'US Catanzaro': ['Catanzaro'],
  'Sampdoria': ['Sampdoria'],
  'Spezia Calcio': ['Spezia'],
  'Bari': ['SSC Bari', 'Bari'],
  'Pisa SC': ['Pisa SC', 'Pisa'],
  'AC Cesena': ['Cesena'],
  'SSD Cosenza Calcio': ['Cosenza'],
  'AS Cittadella': ['Cittadella'],
  'Modena FC': ['Modena'],
  'SPAL': ['SPAL'],
  'Ternana Calcio': ['Ternana'],
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
  'FC St. Pauli': ['FC St. Pauli', 'St Pauli'],
  'Mainz 05': ['Mainz 05', 'FSV Mainz 05'],
  'VfL Bochum': ['VfL Bochum', 'Bochum'],
  'Holstein Kiel': ['Holstein Kiel', 'Kiel'],
  'Hertha BSC': ['Hertha Berlin', 'Hertha BSC'],
  'Hamburger SV': ['Hamburger SV', 'Hamburg'],
  'Fortuna Düsseldorf': ['Fortuna Dusseldorf'],
  'Hannover 96': ['Hannover 96'],
  '1. FC Nürnberg': ['1. FC Nurnberg'],
  'FC Schalke 04': ['Schalke 04', 'FC Schalke 04'],
  '1. FC Köln': ['FC Cologne', 'FC Koln'],
  // Portugal
  'SL Benfica': ['Benfica'],
  'FC Porto': ['FC Porto', 'Porto'],
  'Sporting CP': ['Sporting CP', 'Sporting Lisbon'],
  'SC Braga': ['SC Braga', 'Braga'],
  'Vitória SC': ['Vitoria de Guimaraes', 'Vitoria Guimaraes'],
  'Gil Vicente FC': ['Gil Vicente'],
  'Rio Ave FC': ['Rio Ave'],
  'Boavista FC': ['Boavista'],
  'Casa Pia AC': ['Casa Pia'],
  'Moreirense FC': ['Moreirense'],
  'Estrela da Amadora': ['Estrela Amadora', 'Estrela da Amadora'],
  'Arouca': ['Arouca'],
  'Famalicão': ['Famalicao'],
  'Estoril Praia': ['Estoril'],
  'FC Vizela': ['Vizela'],
  'GD Chaves': ['GD Chaves', 'Chaves'],
  'FC Paços de Ferreira': ['Pacos de Ferreira'],
  // Pays-Bas
  'Ajax Amsterdam': ['Ajax'],
  'PSV Eindhoven': ['PSV Eindhoven', 'PSV'],
  'Feyenoord Rotterdam': ['Feyenoord'],
  'AZ Alkmaar': ['AZ Alkmaar', 'AZ'],
  'FC Twente': ['FC Twente', 'Twente'],
  'FC Utrecht': ['FC Utrecht', 'Utrecht'],
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
  'NAC Breda': ['NAC Breda', 'NAC'],
  'FC Eindhoven': ['FC Eindhoven'],
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
  'Çaykur Rizespor': ['Caykur Rizespor', 'Rizespor'],
  'Bodrum FK': ['Bodrum FK'],
  'Eyüpspor': ['Eyupspor'],
  'Samsunspor': ['Samsunspor'],
  // Suisse
  'BSC Young Boys': ['BSC Young Boys', 'Young Boys'],
  'FC Bâle': ['FC Basel', 'Basel'],
  'FC Zurich': ['FC Zurich'],
  'FC Lugano': ['FC Lugano'],
  'FC St. Gallen': ['FC St. Gallen', 'St Gallen'],
  'FC Lucerne': ['FC Luzern', 'Luzern'],
  'Grasshopper Club Zurich': ['Grasshoppers', 'Grasshopper Club'],
  'FC Sion': ['FC Sion'],
  'Lausanne-Sport': ['Lausanne-Sport', 'Lausanne'],
  'FC Winterthur': ['FC Winterthur', 'Winterthur'],
  // Danemark
  'FC Copenhague': ['FC Copenhagen', 'Copenhagen'],
  'FC Midtjylland': ['FC Midtjylland', 'Midtjylland'],
  'Brøndby IF': ['Brondby IF', 'Brondby'],
  'Silkeborg IF': ['Silkeborg IF', 'Silkeborg'],
  'Odense BK': ['Odense BK', 'Odense'],
  'AaB Aalborg': ['AaB', 'Aalborg'],
  'Viborg FF': ['Viborg FF', 'Viborg'],
  'Randers FC': ['Randers FC'],
  'FC Nordsjælland': ['FC Nordsjaelland', 'Nordsjaelland'],
  'AGF Aarhus': ['Aarhus GF', 'AGF'],
  'Vejle Boldklub': ['Vejle Boldklub', 'Vejle'],
  'Lyngby BK': ['Lyngby BK', 'Lyngby'],
  'AC Horsens': ['AC Horsens', 'Horsens'],
  'Sønderjyske': ['Sonderjyske'],
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
  'Mjällby AIF': ['Mjallby AIF', 'Mjallby'],
  'Örebro SK': ['Orebro SK', 'Orebro'],
  'Degerfors IF': ['Degerfors IF', 'Degerfors'],
  'Halmstads BK': ['Halmstads BK', 'Halmstad'],
  'GIF Sundsvall': ['GIF Sundsvall', 'Sundsvall'],
  'IK Sirius': ['IK Sirius', 'Sirius'],
  // Norvège
  'Rosenborg BK': ['Rosenborg'],
  'Molde FK': ['Molde FK', 'Molde'],
  'FK Bodø/Glimt': ['Bodo Glimt', 'FK Bodo/Glimt'],
  'Vålerenga IF': ['Valerenga', 'Valerenga IF'],
  'Viking FK': ['Viking FK'],
  'Lillestrøm SK': ['Lillestrom SK', 'Lillestrom'],
  'SK Brann': ['SK Brann', 'Brann'],
  'Sarpsborg 08': ['Sarpsborg 08'],
  'Stabæk IF': ['Stabaek IF', 'Stabaek'],
  'Tromsø IL': ['Tromso IL', 'Tromso'],
  'Odd Grenland': ['Odd Grenland', 'Odd'],
  'Strømsgodset IF': ['Stromsgodset', 'Stroemsgodset'],
  'FK Haugesund': ['FK Haugesund', 'Haugesund'],
  'Sandefjord Fotball': ['Sandefjord'],
  'Aalesunds FK': ['Aalesund', 'FK Aalesund'],
  'Fredrikstad FK': ['Fredrikstad FK', 'Fredrikstad'],
  // Finlande
  'HJK Helsinki': ['HJK Helsinki', 'HJK'],
  'FC Inter Turku': ['FC Inter Turku', 'Inter Turku'],
  'FC Haka': ['FC Haka', 'Haka'],
  'SJK Seinäjoki': ['SJK Seinajoki', 'SJK'],
  'KuPS Kuopio': ['KuPS', 'Kuopion Palloseura'],
  'AC Oulu': ['AC Oulu'],
  'Ilves Tampere': ['Ilves Tampere', 'Ilves'],
  'FC Lahti': ['FC Lahti'],
  // Autriche
  'RB Salzbourg': ['Red Bull Salzburg', 'FC Salzburg'],
  'SK Rapid Wien': ['Rapid Vienna', 'Rapid Wien'],
  'SK Sturm Graz': ['Sturm Graz'],
  'LASK': ['LASK', 'LASK Linz'],
  'Wolfsberger AC': ['Wolfsberger AC'],
  'FK Austria Wien': ['FK Austria Wien', 'Austria Vienna'],
  'TSV Hartberg': ['TSV Hartberg', 'Hartberg'],
  'SCR Altach': ['SCR Altach', 'Altach'],
  'GAK Graz': ['GAK', 'GAK Graz'],
  'WSG Tirol': ['WSG Tirol', 'Wacker Innsbruck'],
  'Blau-Weiß Linz': ['Blau-Weiss Linz', 'Blau Weiss Linz'],
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
  'HNK Rijeka': ['HNK Rijeka', 'Rijeka'],
  'Lokomotiva Zagreb': ['Lokomotiva Zagreb'],
  'NK Gorica': ['NK Gorica'],
  'NK Šibenik': ['NK Sibenik'],
  'NK Varaždin': ['NK Varazdin'],
  'NK Istra 1961': ['NK Istra 1961', 'Istra 1961'],
  'HNK Slaven Belupo': ['NK Slaven Koprivnica', 'Slaven Belupo'],
  // Grèce
  'Olympiacos': ['Olympiacos', 'Olympiakos'],
  'Panathinaikos': ['Panathinaikos'],
  'AEK Athènes': ['AEK Athens'],
  'PAOK Thessalonique': ['PAOK Thessaloniki', 'PAOK'],
  'Aris Thessalonique': ['Aris Thessaloniki', 'Aris'],
  'Asteras Tripolis': ['Asteras Tripolis'],
  'Atromitos': ['Atromitos Athens', 'Atromitos'],
  'OFI Crète': ['OFI Crete'],
  'Lamia': ['Lamia FC'],
  'Levadiakos': ['Levadiakos'],
  'Panaitolikos': ['Panaitolikos'],
  // Ukraine
  'Shakhtar Donetsk': ['Shakhtar Donetsk', 'Shaktar Donetsk'],
  'Dynamo Kyiv': ['Dynamo Kyiv', 'Dynamo Kiev'],
  'Zorya Luhansk': ['Zorya Luhansk'],
  'SC Dnipro-1': ['SC Dnipro-1', 'Dnipro'],
  'Metalist Kharkiv': ['Metalist Kharkiv', 'Metalist'],
  'Vorskla Poltava': ['Vorskla Poltava'],
  'Chornomorets Odesa': ['Chernomorets Odessa'],
  'Rukh Lviv': ['Rukh Lviv'],
  // Russie
  'Zenit Saint-Pétersbourg': ['Zenit St Petersburg', 'Zenit'],
  'CSKA Moscou': ['CSKA Moscow'],
  'Spartak Moscou': ['Spartak Moscow'],
  'Lokomotiv Moscou': ['Lokomotiv Moscow'],
  'FC Krasnodar': ['FK Krasnodar', 'Krasnodar'],
  'FC Dynamo Moscou': ['Dynamo Moscow'],
  'FK Rostov': ['FK Rostov', 'Rostov'],
  'FC Akhmat Grozny': ['Akhmat Grozny', 'Akhmat'],
  'PFC Krylya Sovetov': ['Krylya Sovetov'],
  'FC Rubin Kazan': ['Rubin Kazan', 'Rubin'],
  'FC Orenburg': ['FC Orenburg', 'Orenburg'],
  'FK Khimki': ['FK Khimki', 'Khimki'],
  'FC Ural': ['FC Ural Yekaterinburg', 'Ural'],
  'FC Sochi': ['FC Sochi'],
  // Pologne
  'Legia Varsovie': ['Legia Warsaw', 'Legia Warszawa'],
  'Lech Poznań': ['Lech Poznan'],
  'Raków Częstochowa': ['Rakow Czestochowa'],
  'Jagiellonia Białystok': ['Jagiellonia Bialystok', 'Jagiellonia'],
  'Zagłębie Lubin': ['Zaglebie Lubin'],
  'Pogoń Szczecin': ['Pogon Szczecin'],
  'Wisła Kraków': ['Wisla Krakow'],
  'Śląsk Wrocław': ['Slask Wroclaw'],
  'Cracovia': ['Cracovia Krakow', 'Cracovia'],
  'Górnik Zabrze': ['Gornik Zabrze'],
  'Lechia Gdańsk': ['Lechia Gdansk'],
  'Piast Gliwice': ['Piast Gliwice'],
  'Widzew Łódź': ['Widzew Lodz'],
  'Motor Lublin': ['Motor Lublin'],
  'GKS Katowice': ['GKS Katowice'],
  // Roumanie
  'FCSB': ['FCSB', 'Steaua Bucuresti'],
  'CFR Cluj': ['CFR Cluj'],
  'Universitatea Craiova': ['Universitatea Craiova'],
  'Rapid Bucarest': ['Rapid Bucuresti', 'Rapid Bucharest'],
  'Dinamo Bucarest': ['Dinamo Bucharest', 'FC Dinamo'],
  'Petrolul Ploiești': ['Petrolul Ploiesti', 'Petrolul'],
  'FC Voluntari': ['FC Voluntari'],
  'Sepsi OSK': ['Sepsi OSK'],
  'FC Hermannstadt': ['FC Hermannstadt'],
  'Farul Constanța': ['FC Farul Constanta', 'Farul'],
  'FC UTA Arad': ['UTA Arad'],
  // Tchéquie
  'Sparta Prague': ['Sparta Prague', 'Sparta Praha'],
  'Slavia Prague': ['Slavia Prague', 'Slavia Praha'],
  'FC Viktoria Plzeň': ['Viktoria Plzen'],
  'SK Sigma Olomouc': ['Sigma Olomouc'],
  'FC Baník Ostrava': ['FC Banik Ostrava', 'Banik Ostrava'],
  'FK Mladá Boleslav': ['FK Mlada Boleslav'],
  'Bohemians 1905': ['Bohemians Prague 1905', 'Bohemians'],
  'FK Teplice': ['FK Teplice', 'Teplice'],
  'FK Jablonec': ['FK Jablonec'],
  'FC Zbrojovka Brno': ['Zbrojovka Brno'],
  'FC Slovácko': ['FC Slovacko'],
  'FK Pardubice': ['FK Pardubice'],
  'FK Dukla Prague': ['FK Dukla Prague', 'Dukla Praha'],
  'Fastav Zlín': ['FC Zlin', 'Zlin'],
  // Slovaquie
  'FK Slovan Bratislava': ['Slovan Bratislava'],
  'FK DAC Dunajská Streda': ['DAC Dunajska Streda'],
  'MFK Ružomberok': ['MFK Ruzomberok'],
  'FC Spartak Trnava': ['Spartak Trnava'],
  'FK Žilina': ['FK Zilina'],
  'AS Trenčín': ['AS Trencin'],
  // Slovénie
  'NK Olimpija Ljubljana': ['NK Olimpija Ljubljana', 'NK Olimpija'],
  'NK Maribor': ['NK Maribor', 'Maribor'],
  'NK Koper': ['NK Koper'],
  'NK Mura': ['NS Mura', 'NK Mura'],
  'NK Domžale': ['NK Domzale'],
  'NK Celje': ['NK Celje', 'Celje'],
  'ND Gorica': ['ND Gorica'],
  // Bulgarie
  'PFC CSKA Sofia': ['CSKA Sofia'],
  'PFC Ludogorets Razgrad': ['Ludogorets Razgrad', 'Ludogorets'],
  'PFC Lokomotiv Plovdiv': ['Lokomotiv Plovdiv'],
  'Botev Plovdiv': ['Botev Plovdiv'],
  'FC Levski Sofia': ['Levski Sofia', 'Levski'],
  'PFC Beroe Stara Zagora': ['Beroe Stara Zagora', 'Beroe'],
  'PFC Lokomotiv Sofia': ['Lokomotiv Sofia'],
  // Hongrie
  'Ferencvárosi TC': ['Ferencvaros', 'Ferencvarosi TC'],
  'MOL Fehérvár FC': ['MOL Fehervar', 'Fehervar'],
  'Puskás Akadémia FC': ['Puskas Akademia'],
  'Debreceni VSC': ['Debreceni VSC', 'Debrecen'],
  'FC Paks': ['Paksi FC', 'Paks'],
  'Zalaegerszegi TE': ['Zalaegerszeg', 'ZTE'],
  'MTK Budapest': ['MTK Budapest', 'MTK'],
  'Újpest FC': ['Ujpest FC', 'Ujpest'],
  // Islande
  'KR Reykjavík': ['KR Reykjavik', 'KR'],
  'Breiðablik': ['Breidablik'],
  'Valur Reykjavík': ['Valur Reykjavik', 'Valur'],
  'Víkingur Reykjavík': ['Vikingur Reykjavik'],
  'FH Hafnarfjörður': ['FH Hafnarfjordur', 'FH'],
  // Écosse
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
  // Irlande
  'Shamrock Rovers': ['Shamrock Rovers'],
  'Bohemian FC': ['Bohemian FC', 'Bohemians Dublin'],
  'Dundalk FC': ['Dundalk FC', 'Dundalk'],
  'Shelbourne FC': ['Shelbourne'],
  "St. Patrick's Athletic": ["St Patricks Athletic"],
  'Cork City FC': ['Cork City'],
  'Derry City FC': ['Derry City'],
  'Drogheda United': ['Drogheda United'],
  'Sligo Rovers': ['Sligo Rovers'],
  'Galway United': ['Galway United'],
  // Chypre
  'APOEL FC': ['APOEL FC', 'APOEL Nicosia'],
  'Omonia Nicosie': ['Omonia Nicosia', 'AC Omonia'],
  'AEL Limassol': ['AEL Limassol'],
  'Apollon Limassol': ['Apollon Limassol'],
  'AEK Larnaca': ['AEK Larnaca'],
  // Albanie
  'FK Tirana': ['FK Tirana'],
  'FK Partizani Tirana': ['FK Partizani'],
  'FK Vllaznia Shkodër': ['FK Vllaznia'],
  'KF Skënderbeu Korçë': ['KF Skenderbeu'],
  'FK Teuta Durrës': ['FK Teuta'],
  // Bosnie
  'FK Borac Banja Luka': ['FK Borac Banja Luka', 'FK Borac'],
  'FK Sarajevo': ['FK Sarajevo'],
  'NK Zrinjski Mostar': ['FK Zrinjski'],
  'FK Željezničar': ['FK Zeljeznicar'],
  'FK Velež Mostar': ['FK Velez'],
  'NK Čelik Zenica': ['NK Celik Zenica'],
  // Macédoine du Nord
  'FK Shkupi': ['FK Shkupi'],
  'FK Rabotnički': ['FK Rabotnicki'],
  'FK Vardar': ['FK Vardar'],
  // Kosovo
  'FC Prishtina': ['FC Prishtina'],
  'KF Drita': ['FC Drita'],
  'FC Ballkani': ['FC Ballkani'],
  'KF Llapi': ['KF Llapi'],
  // Monténégro
  'FK Budućnost Podgorica': ['FK Buducnost Podgorica'],
  'FK Sutjeska': ['FK Sutjeska'],
  // Moldavie
  'FC Sheriff Tiraspol': ['Sheriff Tiraspol', 'Sheriff'],
  'FC Zimbru Chișinău': ['FC Zimbru'],
  // Biélorussie
  'FC BATE Borisov': ['BATE Borisov'],
  'FC Dynamo Minsk': ['Dynamo Minsk'],
  'FC Shakhtar Soligorsk': ['Shakhtar Soligorsk'],
  // Lettonie
  'FK RFS': ['FK RFS'],
  'FK Riga': ['FK Riga'],
  'FK Liepāja': ['FK Liepajas Metalurgs', 'FK Liepajs'],
  // Lituanie
  'FK Žalgiris': ['FK Zalgiris Vilnius', 'Zalgiris'],
  'FK Sūduva': ['FK Suduva'],
  // Estonie
  'FC Flora Tallinn': ['FC Flora Tallinn', 'Flora Tallinn'],
  'FCI Levadia Tallinn': ['FC Levadia Tallinn', 'Levadia Tallinn'],
  // Arménie
  'FC Pyunik Yerevan': ['FC Pyunik', 'Pyunik Yerevan'],
  'FC Ararat Erevan': ['FC Ararat Yerevan', 'Ararat Armenia'],
  'FC Urartu': ['FC Urartu Yerevan'],
  'FC Shirak': ['FC Shirak'],
  // Azerbaïdjan
  'FK Qarabağ': ['FK Qarabag', 'Qarabag FK'],
  'Neftchi Bakou': ['Neftchi Baku'],
  'FK Keşlə': ['FK Kesla'],
  // Géorgie
  'Dinamo Tbilissi': ['Dinamo Tbilisi'],
  'FC Torpedo Kutaisi': ['Torpedo Kutaisi'],
  'FC Dinamo Batumi': ['Dinamo Batumi'],
  // Kazakhstan
  'FC Kairat': ['FC Kairat Almaty', 'Kairat'],
  'FC Astana': ['FC Astana', 'FC Astana Kazakhstan'],
  'FC Shakhtar Karagandy': ['FK Shakhter Karagandy', 'Shakhtar Karagandy'],
  'Tobol Kostanay': ['FK Tobol', 'Tobol'],
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
  'Cuiabá EC': ['Cuiaba'],
  'EC Vitória': ['EC Vitoria', 'Vitoria'],
  'Atlético Goianiense': ['Atletico Goianiense', 'Atletico GO'],
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
  'Huracán': ['Huracan'],
  'Banfield': ['Banfield'],
  'Godoy Cruz': ['Godoy Cruz'],
  'Platense': ['Platense'],
  'Belgrano': ['Belgrano Cordoba'],
  'Atlético Tucumán': ['Atletico Tucuman'],
  // Colombie
  'Atlético Nacional': ['Atletico Nacional'],
  'Millonarios FC': ['Millonarios'],
  'América de Cali': ['America de Cali'],
  'Junior de Barranquilla': ['Junior FC', 'Junior Barranquilla'],
  'Deportivo Cali': ['Deportivo Cali'],
  'Independiente Santa Fe': ['Independiente Santa Fe', 'Santa Fe'],
  'Once Caldas': ['Once Caldas'],
  'Independiente Medellín': ['Independiente Medellin'],
  'Deportivo Pereira': ['Deportivo Pereira'],
  'Deportes Tolima': ['Deportes Tolima'],
  // Uruguay
  'Club Nacional de Football': ['Nacional Montevideo', 'Club Nacional'],
  'CA Peñarol': ['Penarol'],
  'Defensor Sporting': ['Defensor Sporting'],
  'Danubio FC': ['Danubio'],
  // Mexique
  'Club América': ['Club America', 'America'],
  'CF Monterrey': ['CF Monterrey', 'Monterrey'],
  'Chivas Guadalajara': ['CD Guadalajara', 'Guadalajara Chivas'],
  'Cruz Azul': ['Cruz Azul'],
  'UNAM Pumas': ['Pumas UNAM', 'Club Universidad Nacional'],
  'Tigres UANL': ['Tigres UANL', 'Tigres'],
  'Toluca FC': ['Toluca'],
  'Santos Laguna': ['Santos Laguna'],
  'Club León': ['Club Leon', 'Leon'],
  'Pachuca': ['Pachuca'],
  'Necaxa': ['Club Necaxa', 'Necaxa'],
  'Club Puebla': ['Puebla'],
  'FC Juárez': ['FC Juarez'],
  'Mazatlán FC': ['Mazatlan FC'],
  'Atlas FC': ['Atlas FC', 'Atlas'],
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
  'Philadelphia Union': ['Philadelphia Union'],
  'Portland Timbers': ['Portland Timbers'],
  'Sporting Kansas City': ['Sporting Kansas City'],
  'Minnesota United': ['Minnesota United'],
  'Houston Dynamo': ['Houston Dynamo'],
  'D.C. United': ['DC United'],
  'Colorado Rapids': ['Colorado Rapids'],
  'Real Salt Lake': ['Real Salt Lake'],
  'San Jose Earthquakes': ['San Jose Earthquakes'],
  'FC Dallas': ['FC Dallas'],
  'New England Revolution': ['New England Revolution'],
  'Orlando City SC': ['Orlando City'],
  'St. Louis City SC': ['St. Louis City'],
  'San Diego FC': ['San Diego FC'],
  'Western Sydney Wanderers': ['Western Sydney Wanderers'],
  // Maroc
  'Wydad AC': ['Wydad Casablanca', 'Wydad AC'],
  'Raja Casablanca': ['Raja Casablanca'],
  'AS FAR Rabat': ['AS FAR', 'FAR Rabat'],
  'FUS de Rabat': ['FUS Rabat'],
  'RS Berkane': ['RS Berkane', 'Renaissance Berkane'],
  'Hassania US Agadir': ['Hassania Agadir'],
  'Moghreb Tétouan': ['Moghreb Tetouan', 'MAS Tetouan'],
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
  'Al-Masry': ['Al Masry'],
  'Ismaily SC': ['Ismaily'],
  // Nigeria
  'Enyimba FC': ['Enyimba'],
  'Kano Pillars': ['Kano Pillars'],
  'Rangers International': ['Enugu Rangers'],
  'Lobi Stars': ['Lobi Stars'],
  'Rivers United': ['Rivers United'],
  'Akwa United': ['Akwa United'],
  'Shooting Stars': ['Shooting Stars FC'],
  'Remo Stars': ['Remo Stars'],
  // Cameroun
  'Canon Yaoundé': ['Canon Yaounde'],
  'Coton Sport': ['Cotonsport Garoua', 'Coton Sport'],
  'Tonnerre Kalara Club': ['Tonnerre Yaounde'],
  'Fovu Club de Baham': ['Fovu Club'],
  // Sénégal
  'ASC Jaraaf': ['ASC Jaraaf'],
  'Casa Sports': ['Casa Sports'],
  'US Gorée': ['US Goree'],
  'Génération Foot': ['Generation Foot'],
  'Teungueth FC': ['Teungueth FC'],
  // Côte d\'Ivoire
  'ASEC Mimosas': ['ASEC Mimosas'],
  'Africa Sports': ['Africa Sports'],
  // RD Congo
  'TP Mazembe': ['TP Mazembe'],
  'AS Vita Club': ['AS Vita Club'],
  // Afrique du Sud
  'Kaizer Chiefs': ['Kaizer Chiefs'],
  'Orlando Pirates': ['Orlando Pirates'],
  'Mamelodi Sundowns': ['Mamelodi Sundowns'],
  'Cape Town City': ['Cape Town City'],
  'AmaZulu FC': ['AmaZulu FC', 'AmaZulu'],
  'SuperSport United': ['SuperSport United'],
  'Stellenbosch FC': ['Stellenbosch FC'],
  // Ghana
  'Asante Kotoko': ['Asante Kotoko'],
  'Hearts of Oak': ['Accra Hearts of Oak', 'Hearts of Oak'],
  'WAFA FC': ['WAFA FC'],
  'Medeama SC': ['Medeama SC'],
  'Dreams FC': ['Dreams FC'],
  // Zimbabwe
  'Dynamos FC': ['Dynamos FC Zimbabwe', 'Dynamos'],
  'CAPS United': ['CAPS United'],
  'FC Platinum': ['FC Platinum'],
  'Highlanders FC': ['Highlanders FC'],
  // Kenya
  'Gor Mahia': ['Gor Mahia FC', 'Gor Mahia'],
  'AFC Leopards': ['AFC Leopards'],
  'Tusker FC': ['Tusker FC'],
  // Arabie Saoudite
  'Al-Hilal': ['Al Hilal Saudi', 'Al Hilal'],
  'Al-Nassr': ['Al Nassr'],
  'Al-Ittihad': ['Al Ittihad'],
  'Al-Ahli': ['Al Ahli Saudi', 'Al Ahli Jeddah'],
  'Al-Shabab': ['Al Shabab FC'],
  'Al-Ettifaq': ['Al Ettifaq'],
  'Al-Fateh': ['Al Fateh'],
  'Al-Qadisiah': ['Al Qadisiyah'],
  'Al-Wahda': ['Al Wahda Abu Dhabi'],
  'Al-Taawoun': ['Al Taawoun'],
  'Damac FC': ['Damac FC'],
  // Qatar
  'Al-Sadd SC': ['Al Sadd'],
  'Al-Duhail SC': ['Al Duhail'],
  'Al-Rayyan SC': ['Al Rayyan'],
  'Al-Gharafa SC': ['Al Gharafa'],
  'Al-Arabi SC': ['Al Arabi Qatar'],
  'Al-Wakrah SC': ['Al Wakrah'],
  // EAU
  'Al-Ain FC': ['Al Ain'],
  'Shabab Al-Ahli': ['Shabab Al Ahli'],
  'Al-Jazira': ['Al Jazira'],
  'Al-Wasl': ['Al Wasl'],
  'Sharjah FC': ['Sharjah FC'],
  // Iran
  'Persepolis FC': ['Persepolis'],
  'Esteghlal FC': ['Esteghlal'],
  'Sepahan FC': ['Sepahan'],
  'Tractor FC': ['Tractor SC', 'Tractor'],
  'Foolad FC': ['Foolad FC'],
  'Gol Gohar': ['Gol Gohar'],
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
  'Sanfrecce Hiroshima': ['Sanfrecce Hiroshima'],
  'Consadole Sapporo': ['Consadole Sapporo'],
  'Jubilo Iwata': ['Jubilo Iwata'],
  'Kashiwa Reysol': ['Kashiwa Reysol'],
  'Avispa Fukuoka': ['Avispa Fukuoka'],
  'Kyoto Sanga': ['Kyoto Sanga'],
  'Albirex Niigata': ['Albirex Niigata'],
  // Corée du Sud
  'Jeonbuk Hyundai Motors': ['Jeonbuk Hyundai Motors', 'Jeonbuk Motors'],
  'Ulsan Hyundai': ['Ulsan Hyundai', 'Ulsan HD'],
  'FC Seoul': ['FC Seoul'],
  'Pohang Steelers': ['Pohang Steelers'],
  'Gwangju FC': ['Gwangju FC'],
  'Daejeon Citizen': ['Daejeon Citizen'],
  'Suwon Samsung Bluewings': ['Suwon Samsung Bluewings', 'Suwon Bluewings'],
  'Incheon United': ['Incheon United'],
  'Daegu FC': ['Daegu FC'],
  'Gangwon FC': ['Gangwon FC'],
  'Jeju United': ['Jeju United'],
  // Chine
  'Shanghai Port': ['Shanghai Port', 'Shanghai SIPG'],
  'Guangzhou FC': ['Guangzhou FC', 'Guangzhou Evergrande'],
  'Shandong Taishan': ['Shandong Taishan', 'Shandong Luneng'],
  'Beijing Guoan': ['Beijing Guoan'],
  'Wuhan FC': ['Wuhan FC'],
  'Shanghai Shenhua': ['Shanghai Shenhua'],
  // Australie
  'Melbourne Victory': ['Melbourne Victory'],
  'Sydney FC': ['Sydney FC'],
  'Melbourne City': ['Melbourne City'],
  'Adelaide United': ['Adelaide United'],
  'Perth Glory': ['Perth Glory'],
  'Brisbane Roar': ['Brisbane Roar'],
  'Wellington Phoenix': ['Wellington Phoenix'],
  'Macarthur FC': ['Macarthur FC'],
  'Central Coast Mariners': ['Central Coast Mariners'],
  'Western United': ['Western United'],
  // Inde
  'ATK Mohun Bagan': ['ATK Mohun Bagan', 'Mohun Bagan'],
  'Bengaluru FC': ['Bengaluru FC'],
  'Mumbai City FC': ['Mumbai City FC'],
  'FC Goa': ['FC Goa'],
  'Hyderabad FC': ['Hyderabad FC'],
  'Kerala Blasters': ['Kerala Blasters FC'],
  'NorthEast United FC': ['NorthEast United FC'],
  'Jamshedpur FC': ['Jamshedpur FC'],
  'East Bengal FC': ['East Bengal FC'],
  // Ouzbékistan
  'FC Pakhtakor': ['FC Pakhtakor Tashkent', 'Pakhtakor'],
  'FC Lokomotiv Tashkent': ['FC Lokomotiv Tashkent'],
  'FC Nasaf': ['FC Nasaf Qarshi', 'Nasaf'],
  'FC Bunyodkor': ['FC Bunyodkor'],
  // Amérique centrale
  'Comunicaciones FC': ['Comunicaciones FC'],
  'CSD Municipal': ['CSD Municipal', 'Municipal'],
  'CD Olimpia': ['CD Olimpia Honduras', 'Olimpia Honduras'],
  'CD Motagua': ['CD Motagua'],
  'Deportivo Saprissa': ['Deportivo Saprissa', 'Saprissa'],
  'Liga Deportiva Alajuelense': ['LD Alajuelense', 'Alajuelense'],
  'CS Herediano': ['CS Herediano', 'Herediano'],
  // Chili
  'Colo-Colo': ['Colo Colo', 'Colo-Colo'],
  'Universidad de Chile': ['Universidad de Chile'],
  'Universidad Católica': ['Universidad Católica Santiago', 'CD Universidad Católica'],
  'Huachipato': ['CD Huachipato'],
  'Deportes Antofagasta': ['Deportes Antofagasta'],
  'Everton de Viña del Mar': ['Everton de Vina del Mar', 'Everton Chile'],
  'O\'Higgins FC': ['O\'Higgins Rancagua', 'O Higgins'],
  // Pérou
  'Universitario de Deportes': ['Universitario de Deportes', 'Universitario'],
  'Alianza Lima': ['Alianza Lima'],
  'Sporting Cristal': ['Sporting Cristal'],
  'Club FBC Melgar': ['FBC Melgar', 'Melgar'],
  'Cienciano': ['Cienciano'],
  // Équateur
  'Barcelona SC': ['Barcelona SC', 'Barcelona Sporting Club'],
  'LDU de Quito': ['LDU Quito', 'Liga de Quito'],
  'Independiente del Valle': ['Independiente del Valle'],
  'CS Emelec': ['CS Emelec', 'Emelec'],
  'El Nacional': ['El Nacional Ecuador'],
  'Aucas': ['SD Aucas', 'Aucas'],
  // Bolivie
  'Club Bolívar': ['Club Bolivar', 'Bolivar'],
  'The Strongest': ['The Strongest'],
  'Club Jorge Wilstermann': ['Club Wilstermann'],
  'Club Always Ready': ['Club Always Ready'],
  'Club Blooming': ['Club Blooming'],
  // Paraguay
  'Club Olimpia': ['Club Olimpia', 'Olimpia Asuncion'],
  'Cerro Porteño': ['Cerro Porteno'],
  'Club Libertad': ['Club Libertad'],
  'Club Sol de América': ['Club Sol de America'],
  'Club Guaraní': ['Club Guarani'],
  // Venezuela
  'Caracas FC': ['Caracas FC'],
  'Deportivo Táchira': ['Deportivo Tachira'],
  'Monagas SC': ['Monagas SC'],
  'Zamora FC': ['Zamora FC'],
  // Jordanie
  'Al-Wehdat': ['Al Wehdat'],
  // Liban
  'Nejmeh SC': ['Nejmeh SC'],
  // Irak
  'Al-Shorta': ['Al Shorta SC'],
  'Al-Zawraa': ['Al Zawraa SC'],
  // Thaïlande
  'Buriram United': ['Buriram United FC'],
  'Muangthong United': ['Muangthong United'],
  // Indonésie
  'Persija Jakarta': ['Persija Jakarta'],
  'Persib Bandung': ['Persib Bandung'],
  // Malaisie
  "Johor Darul Ta'zim": ['Johor Darul Takzim', 'JDT'],
  // Kenya
  'Simba SC': ['Simba SC'],
  'Young Africans SC': ['Yanga SC', 'Young Africans'],
  // Zambie
  'Zesco United': ['Zesco United'],
  // Angola
  'Petro de Luanda': ['Petro de Luanda', 'Petro Atletico'],
  'Primeiro de Agosto': ['Primeiro de Agosto'],
  // Nouvelle-Zélande
  'Auckland City FC': ['Auckland City FC'],
  'Waitakere United': ['Waitakere United'],
  'Team Wellington': ['Team Wellington'],
  // Costa Rica
  'CS Cartaginés': ['CS Cartagines', 'Cartaginés'],
  // Canada CPL
  'Forge FC': ['Forge FC'],
  'Cavalry FC': ['Cavalry FC'],
  'Atlético Ottawa': ['Atletico Ottawa'],
  'Pacific FC': ['Pacific FC'],
  'York United': ['York United'],
  'HFX Wanderers': ['HFX Wanderers'],
  'Valour FC': ['Valour FC'],
};

// ── Extra clubs that aren't worth individual mappings — direct name search ──
const EXTRA_DIRECT_SEARCH = [
  // Turkey
  'Eyüpspor', 'Bodrum FK', 'Sariyer FK',
  // Serbia
  'FK Radnički Niš', 'FK Spartak Subotica', 'FK Vojvodina Novi Sad', 'FK Čukarički',
  'FK Proleter Novi Sad', 'FK Inđija', 'FK Kolubara',
  // Romania
  'FC Botoșani', 'Oțelul Galați', 'U Cluj', 'FC Hermannstadt',
  // Hungary
  'Kisvárda FC', 'Budapest Honvéd', 'Diósgyőri VTK', 'Kecskeméti TE',
  // Croatia
  'NK Varaždin', 'NK Šibenik', 'NK Istra 1961', 'HNK Slaven Belupo',
  // Greece
  'Atromitos FC', 'Volos NPS', 'Levadiakos FC', 'OFI Crete', 'PAS Lamia',
  // Ukraine
  'Olimpik Donetsk', 'FK Mynai', 'LNZ Cherkasy', 'FK Veres Rivne',
  'FC Kolos Kovalivka', 'FK Kremin Kremenchuk',
  // Russia
  'Fakel Voronezh', 'FK Nizhny Novgorod',
  // Finland
  'IFK Mariehamn', 'VPS Vaasa', 'FC Jazz Pori', 'IF Gnistan',
  // Slovakia
  'MFK Tatran Liptovský Mikuláš', 'AS Trenčín', 'MFK Skalica', 'FK ZŤS Podbrezová',
  // Moldova
  'FC Sfântul Gheorghe', 'FC Milsami Orhei', 'FC Petrocub Hîncești',
  // Belarus
  'FC Isloch', 'FC Minsk', 'Torpedo Zhodino', 'Dinamo Brest',
  // Georgia
  'FC Saburtalo', 'FC Samtredia', 'FC Chikhura Sachkhere', 'FC WIT Georgia',
  'FC Gagra', 'FC Guria Lanchkhuti', 'FC Spaeri',
  // Armenia
  'FC Van', 'FC Noah Yerevan', 'FC Alashkert',
  // Azerbaijan
  'Sabah FK Baku', 'FK Sabail', 'FK Zira', 'FK Shamakhi', 'Sumgayit FK', 'FK Kapaz',
  // Kosovo
  'FC Gjilani', 'KF Vëllaznimi', 'FC Feronikeli', 'KF Drenica', 'KF Dukagjini',
  // Macedonia
  'FK Akademija Pandev', 'FK Renova', 'FK Sileks', 'FK Struga Trim-Lum',
  'FK Makedonija Gjorče Petrov', 'FK Pelister', 'FK Bregalnica',
  // Montenegro
  'FK Mladost Podgorica', 'FK Iskra Danilovgrad', 'FK Rudar Pljevlja',
  'FK Lovćen Cetinje', 'FK Petrovac', 'FK Zeta',
  // Faroe Islands
  'HB Tórshavn', 'B36 Tórshavn', 'Klaksvíkar Ítróttarfelag', 'NSÍ Runavík',
  // Gibraltar
  'Lincoln Red Imps', 'Europa FC Gibraltar',
  // Luxembourg
  'F91 Dudelange', 'Jeunesse Esch', 'Progrès Niedercorn',
  // Malta
  'Valletta FC', 'Hibernians FC Malta', 'Floriana FC', 'Birkirkara FC',
  // Wales
  'The New Saints', "Connah's Quay Nomads", 'Bala Town FC',
  // Iceland
  'Stjarnan FC', 'Fylkir FC',
  // Brazil extra
  'Juventude FC', 'Criciúma EC', 'América Mineiro',
  // Argentina extra
  'Club Barracas Central', 'CA Tigre', 'CA Sarmiento', 'Arsenal de Sarandí',
  'CA Central Córdoba', 'CA Instituto', 'CA San Martín Tucumán',
  // Colombia extra
  'Deportivo Pereira', 'Envigado FC', 'La Equidad', 'Deportivo Pasto',
  'Patriotas Boyacá', 'Alianza FC', 'Bucaramanga',
  // Chile extra
  'Unión Española', 'Audax Italiano', 'Cobresal', 'Palestino',
  'Cobreloa', 'Deportes Iquique', 'Deportes Temuco',
  // Peru extra
  'Club Sport Boys', 'Ayacucho FC', 'Cusco FC', 'UTC Cajamarca',
  'Sport Huancayo', 'Club Binacional', 'ADT Tarma',
  // Uruguay extra
  'Club Fénix', 'Club Progreso', 'Club Wanderers Montevideo',
  'Rampla Juniors', 'Liverpool FC Uruguay', 'Club Cerro',
  'Club Plaza Colonia', 'Boston River', 'Club Torque',
  // Ecuador extra
  'Macará', 'Mushuc Runa', 'Delfín SC', 'Técnico Universitario',
  'Orense SC', 'Manta FC', 'Guayaquil City',
  // Venezuela extra
  'Mineros de Guayana', 'Metropolitanos FC', 'Carabobo FC',
  'Puerto Cabello FC', 'Estudiantes de Mérida', 'Trujillanos FC',
  // Bolivia extra
  'Club San José Oruro', 'Oriente Petrolero', 'Club Aurora',
  'Real Potosí', 'Nacional Potosí', 'Universitario de Sucre',
  'GV San José', 'Royal Pari', 'Guabirá', 'Palmaflor',
  // Paraguay extra
  'Club Nacional Asunción', 'Sportivo Luqueño', 'Club Sportivo San Lorenzo Paraguay',
  'General Díaz', 'Tacuary FBC', 'Club 12 de Octubre',
  'Resistencia SC', 'Sportivo Ameliano',
  // Mexico extra
  'Deportivo Toluca', 'Deportivo Guadalajara', 'Club Tijuana',
  // CONCACAF
  'Tauro FC', 'CD Águila El Salvador', 'Club Municipal Honduras',
  'Real España Honduras', 'Waterhouse FC Jamaica', 'W Connection Trinidad',
  'Comunicaciones Guatemala', 'Antigua GFC',
  // Saudi extra
  'Al-Fayha', 'Al-Okhdood', 'Damac FC', 'Abha Club', 'Al-Riyadh',
  'Al-Hazem', 'Al-Khaleej', 'Al-Qadisiyyah',
  // UAE extra
  'Baniyas SC', 'Khorfakkan FC', 'Al-Dhafra FC', 'Emirates Club',
  // Japan extra
  'Sagan Tosu', 'Shonan Bellmare', 'Machida Zelvia',
  // South Korea extra
  'Gimcheon Sangmu', 'Suwon FC', 'Jeonnam Dragons', 'Seongnam FC',
  // China extra
  'Tianjin Teda', 'Changchun Yatai', 'Hebei FC', 'Wuhan Three Towns',
  'Meizhou Hakka', 'Cangzhou Mighty Lions', 'Nantong Zhiyun',
  'Qingdao Hainiu', 'Chengdu Rongcheng', 'Shenzhen FC',
  // India extra
  'Chennaiyin FC', 'Odisha FC', 'Punjab FC',
  // Australia extra
  'Newcastle Jets', 'Western United FC',
  // Africa extra
  'RSB Berkane', 'Wydad Casablanca', 'Raja Casablanca',
  'Al Ahly Cairo', 'Zamalek SC Cairo', 'TP Mazembe', 'Al Merrikh Sudan',
  'APR FC Rwanda', 'Rayon Sports Rwanda',
  'Azam FC Tanzania',
  // OFC
  'Hekari United', 'Lae City FC',
  'Ba FC Fiji', 'Lautoka FC', 'Rewa FC',
];

// ── DB helpers ──────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  ...createDbPoolConfig(),
  connectionLimit: 3,
});

async function getExistingLogos() {
  const [rows] = await pool.query('SELECT club_name FROM club_logos');
  return new Set(rows.map(r => r.club_name));
}

async function saveLogo(clubName, logoUrl) {
  await pool.query(
    'INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), updated_at = NOW()',
    [clubName.slice(0, 255), logoUrl]
  );
}

// ── TheSportsDB helpers ─────────────────────────────────────────────────────
async function fetchFromTSDB(searchTerm) {
  try {
    const url = `${TSDB_BASE}/searchteams.php?t=${encodeURIComponent(searchTerm)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.teams || data.teams.length === 0) return null;
    const soccer = data.teams.find(t => t.strSport === 'Soccer') || data.teams[0];
    return soccer.strBadge || soccer.strTeamBadge || null;
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to database…');
  const existing = await getExistingLogos();
  console.log(`Already have ${existing.size} logos in DB. Skipping those.\n`);

  let saved = 0;
  let skipped = 0;
  let notFound = 0;
  const errors = [];

  // Build combined list: mapped + extra direct search
  const allClubs = [
    ...Object.entries(CLUB_NAME_MAP).map(([name, terms]) => ({ name, terms })),
    ...EXTRA_DIRECT_SEARCH.map(name => ({ name, terms: [name] })),
  ];

  const total = allClubs.length;
  console.log(`Processing ${total} clubs…\n`);

  for (let i = 0; i < allClubs.length; i++) {
    const { name, terms } = allClubs[i];

    if (existing.has(name)) {
      skipped++;
      continue;
    }

    let logoUrl = null;
    for (const term of terms) {
      logoUrl = await fetchFromTSDB(term);
      if (logoUrl) break;
      await delay(DELAY_MS);
    }

    if (logoUrl) {
      try {
        await saveLogo(name, logoUrl);
        saved++;
        console.log(`[${i + 1}/${total}] ✓ ${name}`);
      } catch (err) {
        errors.push({ name, error: err.message });
        console.error(`[${i + 1}/${total}] DB error for "${name}": ${err.message}`);
      }
    } else {
      notFound++;
      console.log(`[${i + 1}/${total}] ~ not found: ${name}`);
    }

    await delay(DELAY_MS);
  }

  console.log(`\n── Done ──`);
  console.log(`Saved:     ${saved}`);
  console.log(`Skipped:   ${skipped} (already in DB)`);
  console.log(`Not found: ${notFound}`);
  if (errors.length) {
    console.log(`DB errors: ${errors.length}`);
    errors.forEach(e => console.error(` - ${e.name}: ${e.error}`));
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
