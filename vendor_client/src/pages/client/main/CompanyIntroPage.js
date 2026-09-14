import React from 'react';
import { Text, Box, Flex, Accordion, AccordionItem, AccordionButton, AccordionIcon, AccordionPanel, SimpleGrid } from '@chakra-ui/react';
import Carousel from 'react-multi-carousel';
import ScrollTop from 'components/Scrollbar/ScrollTop';
import AnimationScroll from 'components/Animation/AnimationScroll';
import AppImage from 'components/Frame/AppImage';
import { getFileUrl } from 'utils/utils';
import { mockIntroImage } from 'utils/mockImage';
import { TEN_SUPERS, MAIN_BUSINESS, SIGNATURES, MARS_SHOP, ADDRESS_MAPS, PROD_LINE, INFO_TECH_LAB, COMPANY_BUSINESSES } from 'constants/intro';

/**
 * Every picture on this page is a path under uploads/intro/ resolved by
 * getFileUrl. There is no upload host configured, and those files are not
 * in the repository either, so the whole page - the top ten carousel, the
 * lab grid, the certificates, the floor plans - rendered as a column of
 * broken-image boxes.
 *
 * This wrapper keeps the same call shape and adds the two fallbacks:
 * a real photograph from the mock host when the upload is not there, and
 * an inline placeholder when even that cannot be fetched. Seeded on the
 * stored path, so a given section keeps the same picture across reloads
 * instead of reshuffling on every visit.
 */
const IntroImage = ({ path, mockWidth, mockHeight, ...rest }) => (
  <AppImage
    src={getFileUrl(path)}
    mock={mockIntroImage(path, { width: mockWidth || 800, height: mockHeight || 600 })}
    skeleton={false}
    {...rest}
  />
);

function CompanyIntroPage() {
  const responsive = {
    all: {
      breakpoint: { max: 5000, min: 0 },
      items: 3,
    },
  };

  return (
    <Flex width={"100%"} align={"center"} justify={"center"}>
      <ScrollTop />
      <Flex width={"100%"} direction={"column"} display={{ sx: "none", md: "initial" }}>
        <AnimationScroll type="top" delay={0.2}>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} mt={"100px"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>Vendor</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>The quick brown fox jumps over the lazy dog.</Flex>
            </AnimationScroll>
          </Flex>
        </AnimationScroll>
        <Box w="full" mt={"80px"}>
          <Carousel
            arrows={true}
            autoPlay={true}
            infinite={true}
            pauseOnHover={false}
            responsive={responsive}
            showDots={true}
          >
            {COMPANY_BUSINESSES.map((row, index) => (
              <Flex w="full" key={index} align={"center"} justify={"center"}>
                <Flex borderRadius={"10px"} bgColor={"var(--vendor-band)"} color={"white"} align={"center"} justify={"center"} textAlign={"center"} width={"400px"} height={"350px"}>
                  <Text fontWeight={"bold"} fontSize={"25px"}>{row.name}</Text>
                </Flex>
              </Flex>
            ))}
          </Carousel>
        </Box>
        <Flex width={"100%"} justify={"center"} direction={"column"} align={"center"} mt={"80px"}>
          <Text fontWeight={"bold"} fontSize={"60px"} borderBottom={"1px solid var(--vendor-border)"} width={"80%"} textAlign={"center"}>Top 10</Text>
          <Box w="full" mt={"20px"}>
            <Carousel
              arrows={true}
              autoPlay={true}
              infinite={true}
              pauseOnHover={false}
              responsive={responsive}
              showDots={true}
            >
              {TEN_SUPERS.map((menu, i) => (
                <Flex w="full" h="full" key={i} padding={"10px"} align={"center"} justify={"center"}>
                  <IntroImage path={menu.img} alt="" w="full" h="auto" objectFit="cover" draggable="false" width={"400px"} height={"300px"} mockWidth={400} mockHeight={300} />
                </Flex>
              ))}
            </Carousel>
          </Box>
        </Flex>
        <Flex bgColor={"var(--vendor-band)"} color={"white"} padding={"50px"} mt={"80px"} marginInline={"50px"}>
          <Text fontWeight={"bold"} fontSize={"20px"}>
            The quick brown fox jumps over the lazy dog.

            The quick brown fox jumps over the lazy dog.

            The quick brown fox jumps over the lazy dog.
          </Text>
        </Flex>
        <AnimationScroll type="top" delay={0.2}>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} mt={"100px"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>IT</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>The quick brown fox jumps over the lazy dog.</Flex>
            </AnimationScroll>
          </Flex>
        </AnimationScroll>
        <Flex width={"100%"} alignItems={"center"} justifyContent={"center"}>
          <SimpleGrid columns={{ md: 2, lg: 3 }} width={"80%"} mt={"30px"}>
            {
              INFO_TECH_LAB.map((item, index) => {
                return (
                  <Flex direction={"column"} align={"center"} key={index} boxShadow={"1px 1px 10px 1px #343434"} m={"40px"}>
                    <AnimationScroll type={index % 3 === 0 ? "top" : index % 3 === 1 ? "left" : index % 3 === 2 ? "right" : "bottom"} delay={0.2}>
                      <IntroImage path={item.img} w={"100%"} h={"300px"} objectFit="cover" />
                      <Flex direction={"column"} align={"center"} justify={"center"} padding={"20px"}>
                        <Text fontWeight={"bold"} fontSize={"20px"} textAlign={"center"}>{item.name}</Text>
                        <Text fontSize={"18px"} textAlign={"center"}>{item.description}</Text>
                      </Flex>
                    </AnimationScroll>
                  </Flex>
                )
              })
            }
          </SimpleGrid>
        </Flex>
        <AnimationScroll type="top" delay={0.2}>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} mt={"100px"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>Eprod</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>The quick brown fox jumps over the lazy dog.</Flex>
            </AnimationScroll>
          </Flex>
        </AnimationScroll>
        <Flex width={"100%"} justify={"center"} direction={"column"} align={"center"} mt={"80px"}>
          <Text fontWeight={"bold"} fontSize={"40px"} borderBottom={"1px solid var(--vendor-border)"} width={"90%"} textAlign={"center"}>Certificates</Text>
          <Box w="full" mt={"20px"}>
            <Carousel
              arrows={true}
              autoPlay={true}
              infinite={true}
              pauseOnHover={false}
              responsive={responsive}
              showDots={true}
            >
              {SIGNATURES.map((menu, i) => (
                <Flex w="full" h="full" key={i} padding={"10px"} align={"center"} justify={"center"}>
                  <IntroImage path={menu.img} alt="" w="full" h="auto" objectFit="cover" draggable="false" width={"300px"} height={"400px"} mockWidth={300} mockHeight={400} />
                </Flex>
              ))}
            </Carousel>
          </Box>
        </Flex>
        <Flex width={"100%"} alignItems={"center"} justifyContent={"center"} direction={"column"} mt={"80px"}>
          <Text fontWeight={"bold"} fontSize={"60px"} borderBottom={"1px solid var(--vendor-border)"} width={"90%"} textAlign={"center"}>Workflow</Text>
          <Text fontWeight={"bold"} fontSize={"25px"} width={"80%"} textAlign={"center"} mt={"10px"}>
            The quick brown fox jumps over the lazy dog.

            The quick brown fox jumps over the lazy dog.

            The quick brown fox jumps over the lazy dog.
          </Text>
          <SimpleGrid columns={{ md: 2, lg: 3 }} width={"80%"} mt={"30px"}>
            {
              INFO_TECH_LAB.map((item, index) => {
                return (
                  <Flex direction={"column"} align={"center"} key={index} boxShadow={"1px 1px 10px 1px #343434"} m={"40px"}>
                    <AnimationScroll type={index % 3 === 0 ? "top" : index % 3 === 1 ? "left" : index % 3 === 2 ? "right" : "bottom"} delay={0.2}>
                      <IntroImage path={item.img} w={"100%"} h={"300px"} objectFit="cover" />
                      <Flex direction={"column"} align={"center"} justify={"center"} padding={"20px"}>
                        <Text fontWeight={"bold"} fontSize={"20px"} textAlign={"center"}>{item.name}</Text>
                        <Text fontSize={"18px"} textAlign={"center"}>{item.description}</Text>
                      </Flex>
                    </AnimationScroll>
                  </Flex>
                )
              })
            }
          </SimpleGrid>
        </Flex>
        <AnimationScroll type="top" delay={0.2}>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} mt={"100px"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>Shop</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>The quick brown fox jumps over the lazy dog.</Flex>
            </AnimationScroll>
          </Flex>
        </AnimationScroll>
        {
          MARS_SHOP.map((item, index) => {
            return (
              <Flex key={index} width={"100%"}>
                <Flex position={"absolute"} zIndex={"-1"}>
                  <IntroImage path={item.imgs[0].img} />
                </Flex>
                <Flex zIndex={"20"} direction={"column"} padding={"100px"} width={"100%"} bgColor={"rgba(11, 20, 55, 0.81)"} align={"center"}>
                  <Flex align={"flex-start"} zIndex={"20"} borderBottom={"1px solid #ffffff"} width={"100%"}>
                    <Text padding={"10px 30px 10px 30px"} bgColor={"white"} ml={"20px"} color={"black"} fontWeight={"bold"} fontSize={"30px"}>{item.name}</Text>
                  </Flex>
                  <Box w="90%" mt={"80px"}>
                    <Carousel
                      arrows={false}
                      autoPlay={true}
                      infinite={true}
                      centerMode={true}
                      pauseOnHover={true}
                      responsive={responsive}
                      showDots={true}
                    >
                      {
                        item.imgs.map((image, key) => {
                          return (
                            <IntroImage path={image.img} mb={"30px"} width={"280px"} height={"200px"} objectFit="cover" draggable={"false"} zIndex={"10"} key={key} borderRadius={"40px"} boxShadow={"1px 2px 10px 1px #fffff0"} mockWidth={280} mockHeight={200} />
                          )
                        })
                      }
                    </Carousel>
                  </Box>
                </Flex>
              </Flex>
            )
          })
        }
        <Flex direction={"column"} width={"100%"}>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>Service</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex direction={"column"} color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
              </Flex>
            </AnimationScroll>
          </Flex>
          <Flex direction={"column"} width={"100%"} height={"250px"} bgColor={"var(--vendor-band)"} pl={"40px"}>
            <AnimationScroll type="left" delay={0.5}>
              <Flex color={"white"} fontSize={`calc(200% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"100px"}>AS</Flex>
            </AnimationScroll>
            <AnimationScroll type="left" delay={0.8}>
              <Flex direction={"column"} color={"white"} width={"50%"} fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"} lineHeight={"30px"}>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
                <Text fontSize={`calc(70% + 0.8vmin)`} fontWeight={"extrabold"}>-The quick brown fox jumps over the lazy dog.</Text>
              </Flex>
            </AnimationScroll>
          </Flex>
        </Flex>
        <Flex direction={"column"} bgColor={"var(--vendor-surface)"} color={"var(--vendor-ink)"} justify={"center"} align={"center"} width={"100%"} padding={"20px"}>
          <AnimationScroll type="top" delay={0.2}>
            <Flex m={"10px"} fontSize={`calc(60% + 0.8vmin)`} bgColor={"#4093ffff"} color={"white"} width={"fit-content"} padding={"10px 20px 10px 20px"}>
              <Text>Goto...</Text>
            </Flex>
          </AnimationScroll>
          <Flex width={"100%"} justify={"center"}>
            {ADDRESS_MAPS.map((item, index) => {
              return (
                <Flex width={"100%"} justify={"center"} mb={"10px"} key={index}>
                  <AnimationScroll type={index === 0 ? "left" : "right"} delay={0.3 * index}>
                    <IntroImage path={item.img} />
                  </AnimationScroll>
                </Flex>
              )
            })}
          </Flex>
        </Flex>
      </Flex>
      <Accordion display={{ sx: "initial", md: "none" }} defaultIndex={0} allowMultiple={true} allowToggle={false} bgColor={"var(--vendor-surface)"} color={"var(--vendor-ink)"} borderRadius={"10px"} width={"90%"} mt={"20px"} mb={"20px"}>
        <AccordionItem>
          <AccordionButton justifyContent={"space-between"} borderRadius={"10px"} border={"none"}>
            <Flex>
              <Text fontWeight={"bold"} fontSize={`calc(80% + 0.8vmin)`}>
                Vendor
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel padding={"5px"}>
            <Flex direction={"column"} padding={"10px"}>
              <Flex width={"100%"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex fontSize={`calc(60% + 0.8vmin)`} width={"10%"} bgColor={"#4093ffff"} color={"white"} alignItems={"center"} justifyContent={"center"}>
                  <p style={{ writingMode: "vertical-lr", msWritingMode: "vertical-lr" }}>Vision</p>
                </Flex>
                <Flex fontSize={`calc(60% + 0.8vmin)`} width={"90%"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"10px"}>
                  <Text>
                    The quick brown fox jumps over the lazy dog.
                  </Text>
                </Flex>
              </Flex>
              <Flex width={"100%"} mt={"20px"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex fontSize={`calc(60% + 0.8vmin)`} width={"10%"} bgColor={"#4093ffff"} color={"white"} alignItems={"center"} justifyContent={"center"}>
                  <p style={{ writingMode: "vertical-lr", msWritingMode: "vertical-lr" }}>Business</p>
                </Flex>
                <Flex width={"90%"} direction={"column"}>
                  <Flex bgColor={"#4093ffff"} color={"white"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                    <Text>
                      The quick brown fox jumps over the lazy dog.
                    </Text>
                  </Flex>
                  <Carousel
                    arrows={false}
                    autoPlay={true}
                    centerMode={false}
                    infinite={true}
                    pauseOnHover={false}
                    responsive={responsive}
                    showDots={true}
                  >
                    {MAIN_BUSINESS.map((menu, i) => (
                      <Flex w="full" h="full" key={i} padding={"10px"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"}>
                        <IntroImage path={menu.img} rounded={"full"} alt="" w="full" h="auto" objectFit="cover" draggable="false" />
                      </Flex>
                    ))}
                  </Carousel>
                </Flex>
              </Flex>
              <Flex width={"100%"} mt={"20px"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex width={"100%"} direction={"column"}>
                  <Flex bgColor={"#4093ffff"} color={"white"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                    <Text>
                      Top 10
                    </Text>
                  </Flex>
                  <Carousel
                    arrows={false}
                    autoPlay={true}
                    centerMode={false}
                    infinite={true}
                    pauseOnHover={false}
                    responsive={responsive}
                    showDots={true}
                  >
                    {TEN_SUPERS.map((menu, i) => (
                      <Flex w="full" h="full" key={i} padding={"10px"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"}>
                        <IntroImage path={menu.img} alt="" w="full" h="auto" objectFit="cover" draggable="false" />
                      </Flex>
                    ))}
                  </Carousel>
                </Flex>
              </Flex>
              <Flex width={"100%"} mt={"20px"} direction={"column"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex bgColor={"#4093ffff"} color={"white"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                  <Text>
                    The quick brown fox jumps over the lazy dog.
                  </Text>
                </Flex>
              </Flex>
            </Flex>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton justifyContent={"space-between"} borderRadius={"10px"} border={"none"}>
            <Flex>
              <Text fontWeight={"bold"} fontSize={`calc(80% + 0.8vmin)`}>
                IT Institute
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel padding={"5px"}>
            <Flex direction={"column"} padding={"10px"}>
              {
                INFO_TECH_LAB.map((item, index) => {
                  return (
                    <Box key={index}>
                      <AnimationScroll type="down" delay={index * 0.1} >
                        <Flex width={"100%"} mt={"20px"} direction={"column"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                          <Flex bgColor={"#4093ffff"} color={"white"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                            <Text>
                              {item.name}
                            </Text>
                          </Flex>
                          <Flex width={"100%"}>
                            <Flex width={"30%"}>
                              <IntroImage path={item.img} />
                            </Flex>
                            <Flex width={"70%"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                              {item.description}
                            </Flex>
                          </Flex>
                        </Flex>
                      </AnimationScroll>
                    </Box>
                  )
                })
              }
            </Flex>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton justifyContent={"space-between"} borderRadius={"10px"} border={"none"}>
            <Flex>
              <Text fontWeight={"bold"} fontSize={`calc(80% + 0.8vmin)`}>
                Eprod
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel padding={"5px"}>
            <Flex direction={"column"} padding={"10px"}>
              <Flex width={"100%"} mt={"5px"} direction={"column"}>
                <Carousel
                  arrows={false}
                  autoPlay={true}
                  centerMode={false}
                  infinite={true}
                  pauseOnHover={false}
                  responsive={responsive}
                  showDots={true}
                >
                  {SIGNATURES.map((menu, i) => (
                    <Flex w="full" h="full" key={i} padding={"10px"}>
                      <IntroImage path={menu.img} alt="" w="full" h="auto" objectFit="cover" draggable="false" />
                    </Flex>
                  ))}
                </Carousel>
              </Flex>
              <Flex width={"100%"} mt={"20px"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex width={"100%"} direction={"column"}>
                  <Flex bgColor={"#4093ffff"} color={"white"} padding={"10px"} textAlign={"center"} fontSize={`calc(60% + 0.8vmin)`}>
                    <Text>
                      The quick brown fox jumps over the lazy dog.
                    </Text>
                  </Flex>
                  <Flex fontSize={`calc(60% + 0.8vmin)`} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"10px"}>
                    <Text>
                      The quick brown fox jumps over the lazy dog.
                    </Text>
                  </Flex>
                </Flex>
              </Flex>
              <Flex width={"100%"} mt={"20px"} direction={"column"}>
                {PROD_LINE.map((item, index) => {
                  return (
                    <Flex key={index} align={"center"} justify={"space-between"} width={"100%"} mb={"20px"}>
                      <Flex fontSize={`calc(60% + 0.8vmin)`} width={"40%"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"5px"}>
                        <Text>{item.description}</Text>
                      </Flex>
                      <Flex fontSize={`calc(60% + 0.8vmin)`} padding={"10px"} width={"10%"} bgColor={"#4093ffff"} color={"white"} alignItems={"center"} justifyContent={"center"}>
                        <p style={{ writingMode: "vertical-lr", msWritingMode: "vertical-lr" }}>{item.name}</p>
                      </Flex>
                      <Flex width={"40%"}>
                        <IntroImage path={item.img} />
                      </Flex>
                    </Flex>
                  )
                })}
              </Flex>

            </Flex>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton justifyContent={"space-between"} borderRadius={"10px"} border={"none"}>
            <Flex>
              <Text fontWeight={"bold"} fontSize={`calc(80% + 0.8vmin)`}>
                Shop
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel padding={"5px"}>
            <Flex direction={"column"} padding={"20px"} width={"100%"}>
              {MARS_SHOP.map((item, index) => {
                return (
                  <Flex key={index} direction={"column"} padding={"10px"} borderLeft={"3px solid #4093ffff"} width={"100%"}>
                    <Box position={"relative"} top={"-25px"} left={"-25px"} width={"max-content"} zIndex={3}>
                      <Text borderRadius={"10px"} padding={"10px"} fontWeight={"bold"} fontSize={`calc(60% + 0.8vmin)`} backgroundColor={"#ee7676ff"} color={"#232323"} width={"max-content"}>{item.name}</Text>
                    </Box>
                    {item.imgs.map((imgItem, index) => {
                      return (
                        <Flex key={index} justify={index % 2 === 1 ? "left" : "right"} width={"100%"} mt={"20px"}>
                          <Flex width={"70%"}>
                            <AnimationScroll type={index % 2 === 1 ? "right" : "left"} delay={0.2} >
                              <IntroImage path={imgItem.img} boxShadow={"2px 2px 7px 2px #8b8b8bff"} />
                            </AnimationScroll>
                          </Flex>
                        </Flex>
                      )
                    })}
                  </Flex>
                )
              })}
            </Flex>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton justifyContent={"space-between"} borderRadius={"10px"} border={"none"}>
            <Flex>
              <Text fontWeight={"bold"} fontSize={`calc(80% + 0.8vmin)`}>
                AS
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel padding={"5px"}>
            <Flex direction={"column"} padding={"10px"}>
              <Flex width={"100%"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex fontSize={`calc(60% + 0.8vmin)`} width={"10%"} bgColor={"#4093ffff"} color={"white"} alignItems={"center"} justifyContent={"center"}>
                  <p style={{ writingMode: "vertical-lr", msWritingMode: "vertical-lr" }}>Service</p>
                </Flex>
                <Flex direction={"column"} fontSize={`calc(60% + 0.8vmin)`} width={"90%"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"10px"}>
                  <Text>
                    - The quick brown fox jumps over the lazy dog.
                  </Text>
                  <Text mt={"10px"}>
                    -The quick brown fox jumps over the lazy dog.
                  </Text>
                  <Text mt={"10px"}>
                    -The quick brown fox jumps over the lazy dog.
                  </Text>
                  <Text mt={"10px"}>
                    -The quick brown fox jumps over the lazy dog.
                  </Text>
                </Flex>
              </Flex>

              <Flex mt={"20px"} width={"100%"} boxShadow={"2px 2px 7px 3px #6161618e"}>
                <Flex fontSize={`calc(60% + 0.8vmin)`} width={"10%"} bgColor={"#4093ffff"} color={"white"} alignItems={"center"} justifyContent={"center"}>
                  <p style={{ writingMode: "vertical-lr", msWritingMode: "vertical-lr" }}>AS</p>
                </Flex>
                <Flex direction={"column"} width={"90%"} bgColor={"var(--vendor-surface-sunken)"} color={"var(--vendor-ink)"} padding={"10px"}>
                  <Flex direction={"column"}>
                    <Flex justify={"left"} width={"100%"} borderBottom={"2px solid #4093ffff"}>
                      <Flex fontSize={`calc(40% + 0.8vmin)`} bgColor={"#4093ffff"} color={"white"} padding={"10px"}>
                        <Text>AS</Text>
                      </Flex>
                    </Flex>
                    <Flex mt={"5px"} fontSize={`calc(50% + 0.8vmin)`} border={"1px solid var(--vendor-border)"} direction={"column"} padding={"10px"} boxShadow={"1px 2px 8px 1px #888888ff"}>
                      <Text>- The quick brown fox jumps over the lazy dog.</Text>
                      <Text mt={"10px"}>- The quick brown fox jumps over the lazy dog.</Text>
                      <Text mt={"10px"}>- The quick brown fox jumps over the lazy dog.</Text>
                    </Flex>
                  </Flex>
                  <Flex direction={"column"} mt={"20px"}>
                    <Flex justify={"left"} width={"100%"} borderBottom={"2px solid #4093ffff"}>
                      <Flex fontSize={`calc(40% + 0.8vmin)`} bgColor={"#4093ffff"} color={"white"} padding={"10px"}>
                        <Text>Eprod AS</Text>
                      </Flex>
                    </Flex>
                    <Flex mt={"5px"} fontSize={`calc(50% + 0.8vmin)`} border={"1px solid var(--vendor-border)"} direction={"column"} padding={"10px"} boxShadow={"1px 2px 8px 1px #888888ff"}>
                      <Text>- The quick brown fox jumps over the lazy dog.</Text>
                      <Text mt={"10px"}>- The quick brown fox jumps over the lazy dog.</Text>
                    </Flex>
                  </Flex>
                </Flex>
              </Flex>

              <Flex direction={"column"} justify={"center"} align={"center"} width={"100%"} mt={"30px"} padding={"10px"}>
                <Flex m={"10px"} fontSize={`calc(60% + 0.8vmin)`} bgColor={"#4093ffff"} color={"white"} width={"fit-content"} padding={"10px 20px 10px 20px"}>
                  <Text>Goto...</Text>
                </Flex>
                {ADDRESS_MAPS.map((item, index) => {
                  return (
                    <Flex width={"100%"} mb={"10px"} key={index}>
                      <IntroImage path={item.img} />
                    </Flex>
                  )
                })}
              </Flex>

            </Flex>
          </AccordionPanel>
        </AccordionItem>

      </Accordion>
    </Flex>
  );
}

export default CompanyIntroPage;
