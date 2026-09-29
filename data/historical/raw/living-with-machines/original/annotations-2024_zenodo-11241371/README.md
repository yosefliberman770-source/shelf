# MapReader data: railspace and building annotations

This record contains post-processed annotations relating to MapReader in GeoHumanities workshop (SIGSPATIAL 2022). 

This dataset contains human-annotated MapReader annotations for the National Library of Scotland 2nd-edition Ordnance Survey maps of England, Wales, and Scotland. It was created by members of the Living with Machines digital history project (The Alan Turing Institute/British Library) and the Data/Culture project.

## Dataset Description

- MapReader’s GitHub: https://github.com/Living-with-machines/MapReader 
- MapReader paper: https://dl.acm.org/doi/10.1145/3557919.3565812
- Original link to zenodo dataset containing gold standards and outputs: https://doi.org/10.5281/zenodo.7147906
    - Hugging Face link for same data: https://huggingface.co/datasets/Livingwithmachines/MapReader_Data_SIGSPATIAL_2022
- National Library of Scotland (NLS) Data Foundry link for same data: https://data.nls.uk/data/map-spatial-data/living-with-machines-railspace-building/
- Contacts: Katherine McDonough, The Alan Turing Institute, kmcdonough at turing.ac.uk; Rosie Wood, The Alan Turing Institute, r.wood at gmail.com

### Dataset Summary

MapReader creates datasets for humanities research using historical map scans and their metadata as input. Here we share gold standard annotations and outputs from early experiments using MapReader. The unit of analysis is the 'patch', a region of the map sheet that is, in this dataset, defined as all the 100m x 100m squares making up the area of the map (not including white space outside the neatline, or map collar). 

The expert-annotated gold standard includes ~62k patches. The total, machine-generated, inferred output created by MapReader includes ~30M patches.

Using maps provided by the National Library of Scotland, these outputs reflect labeling tasks relevant to historical research on the [Living with Machines](https://livingwithmachines.ac.uk/) project.

Data shared here is derived from maps printed in nineteenth-century Britain by the Ordnance Survey, Britain's state mapping agency. These maps cover England, Wales, and Scotland from 1888 to 1913.

### Labels

4 labels were used when annotating patches:
- 0: "no"
- 1: "railspace"
- 2: "building"
- 3: "railspace and building"

In this dataset, we have aggregrated labels 1 and 3 as patches which contain "railspace" and, labels 2 and 3 as patches which contain "building".
This was done to create two new binary annotation datasets ("railspace"/"no" and "building"/"no") alongside our 4 label annotation dataset. This enabled us to train two binary models as well as a 4 class model.

For the post-processed annotations, 2 labels are given to patches.
For the railspace annotation dataset:
- 0: "no"
- 1: "railspace"

And for the building annotation dataset:
- 0: "no"
- 1: "building"


## Files in this dataset

This zenodo dataset (10.5281/zenodo.11241598) contains the following files:

### README.md

Description of the data and its context.

### maps.zip

This zip contains 30 map images as `.png` files and their corresponding metadata (`metadata.csv`).

The `metadata.csv` file contains metadata for the 30 map sheets which were annotated.

For each sheet the following metadata is given: 
- name (image ID), 
- url, 
- published_date, 
- region, 
- coordinates, 
- CRS

### slice_meters_100_100.zip

This zip contains 100x100 meter patches as `.png` files for all 30 map images.
These were created by "patchifying" the parent map images. 

### annots_all.csv

This file contains the patch-level annotations all 30 map sheets using all 4 labels.

For each patch, the following data is given:
- **image_id**: patch ID
- **label_index**: The index of the label assigned to the patch e.g. 0: "no" and 3: "building" (see above description of labels)
- **image_path**: The relative path to the image

### annots_all_georeferenced.csv

This file is an expanded version of the  the `annots_all.csv` annotations, containing georeferencing information.

For each patch, in addition to the information in the original file, the following data is given:
- **parent_id**: ID of the map sheet that the patch belongs to
- **pixel_bounds**: The pixel bounds of the patch, relative to the parent image
- **coordinates**: The coordinates of the patch as a tuple of (min_x, min_y, max_x, max_y)
- **crs**: The coordinate reference system (CRS)
- **center_lon**: longitude of the patch center
- **center_lat**: latitude of the patch center
- **polygon** - A polygon representing the patch as a bounding box
- **mean_pixel_R**: The mean value of all red (R) pixel intensities
- **mean_pixel_G**: The mean value of all green (G) pixel intensities
- **mean_pixel_B**: The mean value of all blue (B) pixel intensities
- **mean_pixel_A**: The mean value of all alpha (A) pixel intensities
- **std_pixel_R**: The standard deviation of all red (R) pixel intensities
- **std_pixel_G**: The standard deviation of all green (G) pixel intensities
- **std_pixel_B**: The standard deviation of all blue (B) pixel intensities
- **std_pixel_A**: The standard deviation of all alpha (A) pixel intensities

### annots_railspace_all.csv

This file contains the patch-level annotations for the 30 map images using the binary railspace labels.

For each patch, the following data is given:
- **image_id**: patch ID
- **label_index**: The index of the label assigned to the patch e.g. 0: "no" and 1: "railspace" (see above description of labels)
- **image_path**: The relative path to the image
- **label**: The label as a string

### annots_railspace_all_georeferenced.csv

This file is an expanded version of the  the `annots_railspace_all.csv` annotations, containing georeferencing information.

This is the railspace equivalent to the `annots_all.csv` and `annots_all_georeferenced.csv` files and contains all the same additional columns.

### annots_building.csv

This file contains the patch-level annotations for the 30 map images using the binary building labels.

For each patch, the following data is given:
- **image_id**: patch ID
- **label_index**: The index of the label assigned to the patch e.g. 0: "no" and 1: "building" (see above description of labels)
- **image_path**: The relative path to the image
- **label**: The label as a string

### annots_building_georeferenced.csv

This file is an expanded version of the  the `annots_building.csv` annotations, containing georeferencing information.

This is the building equivalent to the `annots_all.csv` and `annots_all_georeferenced.csv` files and contains all the same additional columns.

## Dataset Creation

### Source Data

#### Initial Data Access

Data was accessed via the National Library of Scotland's Historical Maps API: https://maps.nls.uk/projects/subscription-api/

The data shared here is derived from the six inch to one mile sheets printed between 1888-1913: https://maps.nls.uk/projects/subscription-api/#gb6inch 

### Annotations and Outputs

The annotation datasets collected here are related to experiments to identify:
1. the 'footprint' of rail infrastructure in the UK, a concept we have called 'railspace', and 
2. buildings on the maps.

#### Annotation process

The custom annotation interface built into MapReader is designed specifically to assist researchers in labeling patches relevant to concepts of interest to their research questions. 

Our **guidelines** for the data shared here were:
- for any non-null label (railspace, building, or railspace + building), if a patch contains any visual signal for that label (e.g. 'railspace'), it should be assigned the relevant label. For example, if it is possible for an annotator to see a railway track passing through the corner of a patch, that patch is labeled as 'railspace'.
- the context around the patch should not be used as an aid in extreme cases where it is nearly impossible to determine whether a patch contains a non-null label
- however, the patch context shown in the annotation interface can be used to quickly distinguish between different content types, particularly where the contiguity of a type across patches is useful in determining what label to assign
- for 'railspace': use this label for any type of rail infrastructure as determined by expert labelers. This includes, for example, single-track mining railroads; larger double-track passenger routes; sidings and embankments; etc. It excludes urban trams.
- for 'building': use this label for any size building
- for 'building + railspace': use this label for patches combining these two types of content

Because 'none' (e.g. null) patches made up the vast majority of patches in the total dataset from these map sheets, we ordered patches to annotate based on their pixel intensity. This allowed us to focus first on patches containing more visual content printed on the map sheet, and later to move more quickly through the patches that captured parts of the map with little to no printed features.

#### Who are the annotators?

Data shared here was annotated by Kasra Hosseini and Katherine McDonough.

Members of the Living with Machines research team contributed early annotations during the development of MapReader: Ruth Ahnert, Kaspar Beelen, Mariona Coll-Ardanuy, Emma Griffin, Tim Hobson, Jon Lawrence, Giorgia Tolfo, Daniel van Strien, Olivia Vane, and Daniel C.S. Wilson.

## Credits and re-use terms 

### MapReader outputs

The files shared here are under a Creative Commons Attribution 4.0 International Public License (https://creativecommons.org/licenses/by/4.0/legalcode) (CC-BY) licence. 

If you are interested in working with OS maps from the NLS used to create these results, please also note the re-use terms of the original map images and metadata detailed below.

### Digitized NLS maps

MapReader can retrieve maps from NLS tile server APIs. For these digitized maps (retrieved or locally stored), please note the re-use terms:

Use of the digitised maps for commercial purposes is currently restricted by contract. Use of these digitised maps for non-commercial purposes is permitted under the Creative Commons Attribution 4.0 International Public License (https://creativecommons.org/licenses/by/4.0/legalcode) (CC-BY) license. Please refer to https://maps.nls.uk/copyright.html#exceptions-os for details on copyright and re-use license. Learn more [here](https://maps.nls.uk/copyright.html#re-use).

## Acknowledgements

This work was supported by Living with Machines (AHRC grant AH/S01179X/1), The Alan Turing Institute (EPSRC grant EP/N510129/1) and Data/Culture (AH/Y00745X/1). 
This work was originally produced as part of Living with Machines, a multidisciplinary collaboration delivered by the Arts and Humanities Research Council (AHRC), with The Alan Turing Institute, the British Library and the Universities of Cambridge, East Anglia, Exeter, and Queen Mary University of London, and funded by the UK Research and Innovation (UKRI) Strategic Priority Fund. The National Library of Scotland were key collaborators in enabling the development of MapReader.