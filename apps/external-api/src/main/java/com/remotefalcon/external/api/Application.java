package com.remotefalcon.external.api;

import com.remotefalcon.external.api.configuration.DozerRuntimeHints;
import com.remotefalcon.external.api.configuration.RfpbRuntimeHints;
import org.dozer.DozerBeanMapper;
import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.servlet.server.ServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
@ImportRuntimeHints({DozerRuntimeHints.class, RfpbRuntimeHints.class})
@EnableAspectJAutoProxy
@EnableMongoRepositories
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }

  @Bean
  public DozerBeanMapper mapper() {
    return new DozerBeanMapper();
  }

  @Bean
  public ServletWebServerFactory servletWebServerFactory() {
    return new TomcatServletWebServerFactory();
  }
}
