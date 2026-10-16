VERIFIED

The version moved 1.0.0 -> 1.1.0 and `csv-app` was named as affected before it
was hit. I checked whether the change is really additive for that consumer: it
gains two fields on the reading and no existing promise changed meaning, so
1.1.0 is right and `csv-app` needs no work. Naming it anyway is correct -- the
consumer decides whether it cares, not the producer.
